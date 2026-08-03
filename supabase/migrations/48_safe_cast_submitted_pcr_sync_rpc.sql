-- Make offline PCR sync casts defensive. This prevents optional local payload
-- values from aborting the whole RPC transaction and hiding the real failure.

begin;

create or replace function public.sync_offline_pcr_report(
  report_payload jsonb,
  vital_payload jsonb default '[]'::jsonb,
  submit_report boolean default false
)
returns public.pcr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_pcr_id uuid;
  target_response_id uuid;
  target_dispatch_form_id uuid;
  target_team_id uuid;
  target_dispatch_patient_id uuid;
  target_client_id uuid;
  target_status public.pcr_status;
  saved_report public.pcr_reports%rowtype;
  vital jsonb;
  raw_status text;
  raw_back_to_base text;
  raw_age text;
  raw_birthday text;
  raw_submitted_at text;
  raw_vital_time text;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if auth.uid() is null then
    raise exception 'Authentication required to synchronize PCR reports';
  end if;

  if lower(coalesce(report_payload->>'id', '')) ~ uuid_pattern then
    target_pcr_id := (report_payload->>'id')::uuid;
  elsif lower(coalesce(report_payload->>'pcrId', '')) ~ uuid_pattern then
    target_pcr_id := (report_payload->>'pcrId')::uuid;
  end if;

  if lower(coalesce(report_payload->>'responseId', '')) ~ uuid_pattern then
    target_response_id := (report_payload->>'responseId')::uuid;
  end if;

  if lower(coalesce(report_payload->>'dispatchId', '')) ~ uuid_pattern then
    target_dispatch_form_id := (report_payload->>'dispatchId')::uuid;
  end if;

  if lower(coalesce(report_payload->>'dispatchPatientId', '')) ~ uuid_pattern then
    target_dispatch_patient_id := (report_payload->>'dispatchPatientId')::uuid;
  end if;

  if lower(coalesce(report_payload->>'pcrClientId', '')) ~ uuid_pattern then
    target_client_id := (report_payload->>'pcrClientId')::uuid;
  end if;

  if target_response_id is null then
    raise exception 'Linked response ID is required';
  end if;

  select p.id
  into target_pcr_id
  from public.pcr_reports p
  where p.response_id = target_response_id
    and p.deleted_at is null
  order by p.updated_at desc
  limit 1;

  target_pcr_id := coalesce(target_pcr_id, target_client_id);

  if target_pcr_id is null then
    raise exception 'PCR ID is required';
  end if;

  select r.responding_team_id
  into target_team_id
  from public.responses r
  where r.id = target_response_id
    and r.deleted_at is null;

  if target_team_id is null then
    raise exception 'Linked response was not found or has no responding team';
  end if;

  if not (public.is_admin() or target_team_id in (select public.user_team_ids())) then
    raise exception 'Not authorized to synchronize this PCR report';
  end if;

  if target_dispatch_form_id is not null and not exists (
    select 1
    from public.dispatch_forms d
    where d.id = target_dispatch_form_id
      and d.response_id = target_response_id
      and d.deleted_at is null
  ) then
    target_dispatch_form_id := null;
  end if;

  if target_dispatch_form_id is null then
    select d.id
    into target_dispatch_form_id
    from public.dispatch_forms d
    where d.response_id = target_response_id
      and d.deleted_at is null
    order by d.updated_at desc
    limit 1;
  end if;

  raw_status := lower(trim(coalesce(report_payload->>'status', '')));
  target_status := case
    when raw_status = 'verified' then 'verified'::public.pcr_status
    when raw_status = 'rejected' then 'rejected'::public.pcr_status
    when raw_status in ('submitted', 'submitted locally', 'completed', 'pcr completed locally') then 'submitted'::public.pcr_status
    when submit_report then 'submitted'::public.pcr_status
    when raw_status = 'draft' then 'draft'::public.pcr_status
    else 'in_progress'::public.pcr_status
  end;

  raw_back_to_base := nullif(report_payload->>'backToBase', '');
  raw_submitted_at := nullif(report_payload->>'submittedAt', '');

  insert into public.pcr_reports (
    id,
    response_id,
    dispatch_form_id,
    dispatch_patient_id,
    responding_team_id,
    field_officer_id,
    client_generated_id,
    status,
    triage,
    chief_complaint,
    emergency_types,
    trauma_types,
    incident_nature,
    hospital_name,
    resident_on_duty,
    endorsed_to,
    received_by,
    transfer_reason,
    notes,
    back_to_base_time,
    submitted_at,
    completed_at,
    created_by,
    updated_by
  )
  values (
    target_pcr_id,
    target_response_id,
    target_dispatch_form_id,
    target_dispatch_patient_id,
    target_team_id,
    auth.uid(),
    coalesce(target_client_id, target_pcr_id),
    target_status,
    nullif(report_payload->>'triage', ''),
    nullif(report_payload->>'chiefComplaint', ''),
    ARRAY(select jsonb_array_elements_text(coalesce(report_payload->'emergencyTypes', '[]'::jsonb))),
    ARRAY(select jsonb_array_elements_text(coalesce(report_payload->'traumaTypes', '[]'::jsonb))),
    nullif(report_payload->>'incidentNature', ''),
    nullif(report_payload->>'hospitalName', ''),
    nullif(report_payload->>'residentOnDuty', ''),
    nullif(report_payload->>'endorsedTo', ''),
    nullif(report_payload->>'receivedBy', ''),
    nullif(report_payload->>'transferReason', ''),
    nullif(report_payload->>'notes', ''),
    case when raw_back_to_base ~ '^\d{1,2}:\d{2}(:\d{2})?$' then raw_back_to_base::time else null end,
    case
      when target_status = 'submitted' and raw_submitted_at ~ '^\d{4}-\d{2}-\d{2}T' then raw_submitted_at::timestamptz
      when target_status = 'submitted' then now()
      else null
    end,
    null,
    auth.uid(),
    auth.uid()
  )
  on conflict (id) do update
    set response_id = excluded.response_id,
        dispatch_form_id = coalesce(public.pcr_reports.dispatch_form_id, excluded.dispatch_form_id),
        dispatch_patient_id = coalesce(public.pcr_reports.dispatch_patient_id, excluded.dispatch_patient_id),
        responding_team_id = excluded.responding_team_id,
        field_officer_id = coalesce(public.pcr_reports.field_officer_id, excluded.field_officer_id),
        client_generated_id = coalesce(public.pcr_reports.client_generated_id, excluded.client_generated_id),
        status = excluded.status,
        triage = excluded.triage,
        chief_complaint = excluded.chief_complaint,
        emergency_types = excluded.emergency_types,
        trauma_types = excluded.trauma_types,
        incident_nature = excluded.incident_nature,
        hospital_name = excluded.hospital_name,
        resident_on_duty = excluded.resident_on_duty,
        endorsed_to = excluded.endorsed_to,
        received_by = excluded.received_by,
        transfer_reason = excluded.transfer_reason,
        notes = excluded.notes,
        back_to_base_time = coalesce(excluded.back_to_base_time, public.pcr_reports.back_to_base_time),
        submitted_at = coalesce(public.pcr_reports.submitted_at, excluded.submitted_at),
        updated_by = auth.uid(),
        updated_at = now()
  returning * into saved_report;

  delete from public.pcr_vital_signs
  where pcr_report_id = saved_report.id;

  if jsonb_typeof(vital_payload) = 'array' then
    for vital in select * from jsonb_array_elements(vital_payload)
    loop
      raw_vital_time := nullif(vital->>'time', '');
      insert into public.pcr_vital_signs (
        id,
        pcr_report_id,
        measured_time,
        blood_pressure,
        pulse_rate,
        respiratory_rate,
        temperature,
        oxygen_saturation
      )
      values (
        case when lower(coalesce(vital->>'id', '')) ~ uuid_pattern then (vital->>'id')::uuid else gen_random_uuid() end,
        saved_report.id,
        case when raw_vital_time ~ '^\d{1,2}:\d{2}(:\d{2})?$' then raw_vital_time::time else null end,
        nullif(vital->>'bp', ''),
        nullif(vital->>'pulse', ''),
        nullif(vital->>'respiratory', ''),
        nullif(vital->>'temperature', ''),
        nullif(vital->>'oxygen', '')
      );
    end loop;
  end if;

  if target_status = 'submitted' then
    raw_age := nullif(report_payload->>'age', '');
    raw_birthday := nullif(report_payload->>'birthday', '');

    update public.responses
    set patient_name = coalesce(nullif(report_payload->>'patientName', ''), patient_name),
        patient_age = coalesce(case when raw_age ~ '^\d{1,3}$' then raw_age::integer else null end, patient_age),
        patient_birthday = coalesce(case when raw_birthday ~ '^\d{4}-\d{2}-\d{2}$' then raw_birthday::date else null end, patient_birthday),
        patient_sex = coalesce(nullif(report_payload->>'gender', ''), patient_sex),
        patient_address = coalesce(nullif(report_payload->>'address', ''), patient_address),
        initial_assessment = coalesce(nullif(report_payload->>'chiefComplaint', ''), initial_assessment),
        updated_at = now()
    where id = target_response_id;

    update public.dispatch_patients
    set patient_name = coalesce(nullif(report_payload->>'patientName', ''), patient_name),
        age = coalesce(case when raw_age ~ '^\d{1,3}$' then raw_age::integer else null end, age),
        birthday = coalesce(case when raw_birthday ~ '^\d{4}-\d{2}-\d{2}$' then raw_birthday::date else null end, birthday),
        sex = coalesce(nullif(report_payload->>'gender', ''), sex),
        address = coalesce(nullif(report_payload->>'address', ''), address),
        assessment_findings = coalesce(nullif(report_payload->>'chiefComplaint', ''), assessment_findings),
        updated_at = now()
    where (target_dispatch_patient_id is not null and id = target_dispatch_patient_id)
       or (dispatch_form_id = target_dispatch_form_id and patient_order = 1);

    update public.responses
    set status = 'pcr_completed',
        updated_at = now()
    where id = target_response_id;

    update public.dispatch_forms
    set status = 'pcr_completed',
        updated_by = auth.uid(),
        updated_at = now()
    where id = target_dispatch_form_id
       or response_id = target_response_id;
  end if;

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('submit', 'pcr_reports', saved_report.id, saved_report.response_id, to_jsonb(saved_report));

  return saved_report;
end;
$$;

revoke execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) to authenticated;

commit;

