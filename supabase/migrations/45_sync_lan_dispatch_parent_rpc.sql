-- Allow a responder to safely materialize the parent response/dispatch received
-- through LAN before uploading its PCR. This keeps RLS on while preventing PCRs
-- from creating unrelated responses.

begin;

create or replace function public.sync_lan_dispatch_parent(dispatch_payload jsonb)
returns public.dispatch_forms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_response_id uuid;
  target_dispatch_id uuid;
  target_team_id uuid;
  target_unit_id uuid;
  saved_dispatch public.dispatch_forms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to synchronize LAN dispatch parent';
  end if;

  target_response_id := coalesce(
    nullif(dispatch_payload->>'responseId', '')::uuid,
    nullif(dispatch_payload->>'responseClientId', '')::uuid
  );
  target_dispatch_id := coalesce(
    nullif(dispatch_payload->>'dispatchId', '')::uuid,
    nullif(dispatch_payload->>'dispatchClientId', '')::uuid,
    nullif(dispatch_payload->>'id', '')::uuid
  );
  target_team_id := nullif(dispatch_payload->>'respondingTeamId', '')::uuid;
  target_unit_id := nullif(dispatch_payload->>'vehicleId', '')::uuid;

  if target_team_id is null and nullif(dispatch_payload->>'team', '') is not null then
    select id into target_team_id
    from public.responding_teams
    where lower(name) = lower(dispatch_payload->>'team')
      and deleted_at is null
    limit 1;
  end if;

  if target_unit_id is null and nullif(dispatch_payload->>'vehicle', '') is not null then
    select id into target_unit_id
    from public.ambulance_units
    where lower(call_sign) = lower(dispatch_payload->>'vehicle')
      and deleted_at is null
    limit 1;
  end if;

  if target_response_id is null then
    raise exception 'LAN dispatch response ID is required';
  end if;

  if target_dispatch_id is null then
    raise exception 'LAN dispatch ID is required';
  end if;

  if target_team_id is null then
    raise exception 'LAN dispatch has no responding team';
  end if;

  if not (public.is_admin() or public.is_dispatcher() or target_team_id in (select public.user_team_ids())) then
    raise exception 'Not authorized to synchronize this LAN dispatch parent';
  end if;

  insert into public.responses (
    id,
    client_generated_id,
    date_of_incident,
    time_of_incident,
    place_of_incident,
    location_text,
    latitude,
    longitude,
    caller_name,
    caller_contact,
    caller_address,
    patient_name,
    patient_age,
    patient_birthday,
    patient_sex,
    patient_address,
    initial_assessment,
    responding_team_id,
    assigned_unit_id,
    driver_name,
    main_aider_name,
    assistant_aider_name,
    status,
    accepted_by_profile_id,
    accepted_at
  )
  values (
    target_response_id,
    target_response_id,
    nullif(dispatch_payload->>'dateOfIncident', '')::date,
    nullif(dispatch_payload->>'timeOfIncident', '')::time,
    coalesce(nullif(dispatch_payload->>'placeOfIncident', ''), nullif(dispatch_payload->>'locationText', '')),
    coalesce(nullif(dispatch_payload->>'locationText', ''), nullif(dispatch_payload->>'placeOfIncident', '')),
    nullif(dispatch_payload->>'latitude', '')::numeric,
    nullif(dispatch_payload->>'longitude', '')::numeric,
    nullif(dispatch_payload->>'callerName', ''),
    nullif(dispatch_payload->>'callerContact', ''),
    nullif(dispatch_payload->>'callerAddress', ''),
    nullif(dispatch_payload->>'patientName', ''),
    nullif(dispatch_payload->>'age', '')::integer,
    nullif(dispatch_payload->>'birthday', '')::date,
    nullif(dispatch_payload->>'gender', ''),
    nullif(dispatch_payload->>'address', ''),
    nullif(dispatch_payload->>'chiefComplaint', ''),
    target_team_id,
    target_unit_id,
    nullif(dispatch_payload->>'driver', ''),
    coalesce(nullif(dispatch_payload->>'mainAider', ''), nullif(dispatch_payload->>'groupLeader', '')),
    nullif(dispatch_payload->>'assistantAider', ''),
    'pcr_in_progress',
    auth.uid(),
    now()
  )
  on conflict (id) do update
    set responding_team_id = coalesce(public.responses.responding_team_id, excluded.responding_team_id),
        assigned_unit_id = coalesce(public.responses.assigned_unit_id, excluded.assigned_unit_id),
        status = case
          when public.responses.status = 'pcr_completed' then public.responses.status
          else excluded.status
        end,
        accepted_by_profile_id = coalesce(public.responses.accepted_by_profile_id, excluded.accepted_by_profile_id),
        accepted_at = coalesce(public.responses.accepted_at, excluded.accepted_at),
        updated_at = now();

  insert into public.dispatch_forms (
    id,
    response_id,
    client_generated_id,
    dispatch_time,
    arrival_scene_time,
    departure_scene_time,
    arrival_hospital_time,
    departure_hospital_time,
    arrival_office_time,
    hospital_name,
    number_of_patients,
    status,
    sent_at,
    created_by,
    updated_by
  )
  values (
    target_dispatch_id,
    target_response_id,
    target_dispatch_id,
    nullif(dispatch_payload->>'dispatchedTime', '')::time,
    nullif(dispatch_payload->>'arrivalScene', '')::time,
    nullif(dispatch_payload->>'departureScene', '')::time,
    nullif(dispatch_payload->>'arrivalHospital', '')::time,
    nullif(dispatch_payload->>'departureHospital', '')::time,
    nullif(dispatch_payload->>'backToBase', '')::time,
    nullif(dispatch_payload->>'hospitalName', ''),
    greatest(coalesce(nullif(dispatch_payload->>'numberOfPatients', '')::integer, 1), 1),
    'pcr_in_progress',
    coalesce(nullif(dispatch_payload->>'sentAt', '')::timestamptz, now()),
    auth.uid(),
    auth.uid()
  )
  on conflict (id) do update
    set response_id = excluded.response_id,
        status = case
          when public.dispatch_forms.status = 'pcr_completed' then public.dispatch_forms.status
          else excluded.status
        end,
        updated_by = auth.uid(),
        updated_at = now()
  returning * into saved_dispatch;

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('create', 'dispatch_forms', saved_dispatch.id, target_response_id, to_jsonb(saved_dispatch));

  return saved_dispatch;
end;
$$;

revoke execute on function public.sync_lan_dispatch_parent(jsonb) from public, anon;
grant execute on function public.sync_lan_dispatch_parent(jsonb) to authenticated;

commit;
