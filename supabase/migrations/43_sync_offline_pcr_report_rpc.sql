-- Idempotent offline PCR sync RPC.
-- Allows a field responder to upload a PCR created offline/local as long as the
-- linked response belongs to one of their teams. The function owns the upsert
-- and child vital replacement so browser retries do not duplicate records.

begin;

alter table public.responses
  add column if not exists client_generated_id uuid;

alter table public.dispatch_forms
  add column if not exists client_generated_id uuid;

alter table public.dispatch_patients
  add column if not exists client_generated_id uuid;

alter table public.pcr_reports
  add column if not exists client_generated_id uuid,
  add column if not exists dispatch_patient_id uuid references public.dispatch_patients(id) on delete set null;

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
  target_status public.pcr_status;
  saved_report public.pcr_reports%rowtype;
  vital jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to synchronize PCR reports';
  end if;

  target_pcr_id := nullif(report_payload->>'id', '')::uuid;
  target_pcr_id := coalesce(target_pcr_id, nullif(report_payload->>'pcrId', '')::uuid);
  target_response_id := nullif(report_payload->>'responseId', '')::uuid;
  target_dispatch_form_id := nullif(report_payload->>'dispatchId', '')::uuid;

  if target_response_id is null then
    raise exception 'Linked response ID is required';
  end if;

  select p.id
  into target_pcr_id
  from public.pcr_reports p
  where p.response_id = target_response_id
    and p.deleted_at is null
  limit 1;

  target_pcr_id := coalesce(
    target_pcr_id,
    nullif(report_payload->>'id', '')::uuid,
    nullif(report_payload->>'pcrId', '')::uuid
  );

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
    limit 1;
  end if;

  target_status := case
    when lower(coalesce(report_payload->>'status', '')) = 'completed' then 'completed'::public.pcr_status
    when lower(coalesce(report_payload->>'status', '')) = 'verified' then 'verified'::public.pcr_status
    when lower(coalesce(report_payload->>'status', '')) = 'rejected' then 'rejected'::public.pcr_status
    when lower(coalesce(report_payload->>'status', '')) = 'submitted' then 'submitted'::public.pcr_status
    when submit_report then 'submitted'::public.pcr_status
    when lower(coalesce(report_payload->>'status', '')) = 'draft' then 'draft'::public.pcr_status
    else 'in_progress'::public.pcr_status
  end;

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
    nullif(report_payload->>'dispatchPatientId', '')::uuid,
    target_team_id,
    auth.uid(),
    coalesce(nullif(report_payload->>'pcrClientId', '')::uuid, target_pcr_id),
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
    nullif(report_payload->>'backToBase', '')::time,
    case when target_status in ('submitted', 'completed') then coalesce(nullif(report_payload->>'submittedAt', '')::timestamptz, now()) else null end,
    case when target_status = 'completed' then coalesce(nullif(report_payload->>'completedAt', '')::timestamptz, now()) else null end,
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
        back_to_base_time = excluded.back_to_base_time,
        submitted_at = coalesce(public.pcr_reports.submitted_at, excluded.submitted_at),
        completed_at = coalesce(public.pcr_reports.completed_at, excluded.completed_at),
        updated_by = auth.uid(),
        updated_at = now()
  returning * into saved_report;

  delete from public.pcr_vital_signs
  where pcr_report_id = saved_report.id;

  if jsonb_typeof(vital_payload) = 'array' then
    for vital in select * from jsonb_array_elements(vital_payload)
    loop
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
        coalesce(nullif(vital->>'id', '')::uuid, gen_random_uuid()),
        saved_report.id,
        nullif(vital->>'time', '')::time,
        nullif(vital->>'bp', ''),
        nullif(vital->>'pulse', ''),
        nullif(vital->>'respiratory', ''),
        nullif(vital->>'temperature', ''),
        nullif(vital->>'oxygen', '')
      );
    end loop;
  end if;

  if target_status = 'completed' then
    update public.responses
    set patient_name = coalesce(nullif(report_payload->>'patientName', ''), patient_name),
        patient_age = coalesce(nullif(report_payload->>'age', '')::integer, patient_age),
        patient_birthday = coalesce(nullif(report_payload->>'birthday', '')::date, patient_birthday),
        patient_sex = coalesce(nullif(report_payload->>'gender', ''), patient_sex),
        patient_address = coalesce(nullif(report_payload->>'address', ''), patient_address),
        initial_assessment = coalesce(nullif(report_payload->>'chiefComplaint', ''), initial_assessment),
        updated_at = now()
    where id = target_response_id
      and (
        patient_name is null
        or patient_name = ''
        or lower(patient_name) = 'unnamed patient'
        or nullif(report_payload->>'patientName', '') is not null
      );

    update public.dispatch_patients
    set patient_name = coalesce(nullif(report_payload->>'patientName', ''), patient_name),
        age = coalesce(nullif(report_payload->>'age', '')::integer, age),
        birthday = coalesce(nullif(report_payload->>'birthday', '')::date, birthday),
        sex = coalesce(nullif(report_payload->>'gender', ''), sex),
        address = coalesce(nullif(report_payload->>'address', ''), address),
        assessment_findings = coalesce(nullif(report_payload->>'chiefComplaint', ''), assessment_findings),
        updated_at = now()
    where id = nullif(report_payload->>'dispatchPatientId', '')::uuid
       or (
        dispatch_form_id = target_dispatch_form_id
        and patient_order = 1
      );

    update public.responses
    set status = 'pcr_completed',
        resolved_at = coalesce(resolved_at, saved_report.completed_at, now()),
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
