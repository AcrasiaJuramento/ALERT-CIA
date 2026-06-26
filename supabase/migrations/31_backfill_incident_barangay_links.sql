-- Backfill barangay links for response and incident rows created before barangay seed data existed.
-- Also teaches the response-to-incident sync to infer barangay_id from typed barangay/location text.

begin;

create or replace function public.normalized_barangay_lookup(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(value, '')), '\((poblacion|formerly atelan)\)', '', 'g'),
      '(brgy\.?|barangay|poblacion|municipality of echague|echague|isabela)',
      '',
      'g'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

update public.responses r
set barangay_id = b.id
from public.barangays b
where r.barangay_id is null
  and b.active
  and (
    public.normalized_barangay_lookup(r.place_of_incident) = public.normalized_barangay_lookup(b.name)
    or public.normalized_barangay_lookup(r.caller_address) = public.normalized_barangay_lookup(b.name)
    or public.normalized_barangay_lookup(r.patient_address) = public.normalized_barangay_lookup(b.name)
    or public.normalized_barangay_lookup(r.place_of_incident) like '%' || public.normalized_barangay_lookup(b.name) || '%'
    or public.normalized_barangay_lookup(r.caller_address) like '%' || public.normalized_barangay_lookup(b.name) || '%'
    or public.normalized_barangay_lookup(r.patient_address) like '%' || public.normalized_barangay_lookup(b.name) || '%'
  );

update public.incidents i
set barangay_id = r.barangay_id
from public.responses r
where i.response_id = r.id
  and i.barangay_id is null
  and r.barangay_id is not null;

update public.incidents i
set barangay_id = b.id
from public.barangays b
where i.barangay_id is null
  and b.active
  and (
    public.normalized_barangay_lookup(i.location_text) = public.normalized_barangay_lookup(b.name)
    or public.normalized_barangay_lookup(i.location_text) like '%' || public.normalized_barangay_lookup(b.name) || '%'
  );

create or replace function public.sync_response_to_incident(
  target_response_id uuid,
  expose_public boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_response public.responses%rowtype;
  linked_pcr public.pcr_reports%rowtype;
  incident_id uuid;
  next_title text;
  next_description text;
  next_classification public.incident_classification;
  next_priority public.incident_priority;
  next_location extensions.geography(point, 4326);
  next_barangay_id uuid;
begin
  select * into target_response
  from public.responses
  where id = target_response_id
    and deleted_at is null;

  if not found then
    raise exception 'Response not found';
  end if;

  select * into linked_pcr
  from public.pcr_reports
  where response_id = target_response_id
    and deleted_at is null
  order by updated_at desc
  limit 1;

  select b.id into next_barangay_id
  from public.barangays b
  where b.active
    and (
      b.id = target_response.barangay_id
      or public.normalized_barangay_lookup(target_response.place_of_incident) = public.normalized_barangay_lookup(b.name)
      or public.normalized_barangay_lookup(target_response.caller_address) = public.normalized_barangay_lookup(b.name)
      or public.normalized_barangay_lookup(target_response.patient_address) = public.normalized_barangay_lookup(b.name)
      or public.normalized_barangay_lookup(target_response.place_of_incident) like '%' || public.normalized_barangay_lookup(b.name) || '%'
      or public.normalized_barangay_lookup(target_response.caller_address) like '%' || public.normalized_barangay_lookup(b.name) || '%'
      or public.normalized_barangay_lookup(target_response.patient_address) like '%' || public.normalized_barangay_lookup(b.name) || '%'
    )
  order by case when b.id = target_response.barangay_id then 0 else 1 end, length(b.name) desc
  limit 1;

  next_classification := public.classify_response_incident(
    coalesce(linked_pcr.incident_nature, target_response.type_of_incident)
  );
  next_priority := public.priority_from_pcr_triage(linked_pcr.triage);
  next_title := coalesce(
    nullif(target_response.type_of_incident, ''),
    nullif(linked_pcr.incident_nature, ''),
    'Emergency response'
  );
  next_description := coalesce(
    nullif(linked_pcr.chief_complaint, ''),
    nullif(linked_pcr.notes, ''),
    nullif(target_response.initial_assessment, ''),
    nullif(target_response.caller_address, ''),
    'Dispatch and PCR workflow record synced into incidents.'
  );

  select centroid into next_location
  from public.barangays
  where id = next_barangay_id
    and active
  limit 1;

  select id into incident_id
  from public.incidents
  where response_id = target_response_id
    and deleted_at is null
  order by created_at asc
  limit 1;

  if incident_id is null then
    insert into public.incidents(
      response_id,
      barangay_id,
      classification,
      subtype,
      priority,
      title,
      description,
      incident_date,
      incident_time,
      location_text,
      location,
      public_visible,
      status,
      record_origin
    )
    values (
      target_response.id,
      next_barangay_id,
      next_classification,
      nullif(target_response.type_of_incident, ''),
      next_priority,
      next_title,
      next_description,
      coalesce(target_response.date_of_incident, current_date),
      target_response.time_of_incident,
      coalesce(nullif(target_response.place_of_incident, ''), nullif(target_response.caller_address, '')),
      next_location,
      expose_public or target_response.status = 'pcr_completed',
      target_response.status,
      'official'
    )
    returning id into incident_id;
  else
    update public.incidents
    set barangay_id = coalesce(next_barangay_id, barangay_id),
        classification = next_classification,
        subtype = coalesce(nullif(target_response.type_of_incident, ''), subtype),
        priority = next_priority,
        title = next_title,
        description = next_description,
        incident_date = coalesce(target_response.date_of_incident, incident_date, current_date),
        incident_time = coalesce(target_response.time_of_incident, incident_time),
        location_text = coalesce(nullif(target_response.place_of_incident, ''), nullif(target_response.caller_address, ''), location_text),
        location = coalesce(location, next_location),
        public_visible = public_visible or expose_public or target_response.status = 'pcr_completed',
        status = target_response.status,
        updated_at = now()
    where id = incident_id;
  end if;

  if target_response.barangay_id is null and next_barangay_id is not null then
    update public.responses
    set barangay_id = next_barangay_id
    where id = target_response.id;
  end if;

  return incident_id;
end;
$$;

do $$
declare
  target_response_id uuid;
  target_status public.dispatch_status;
begin
  for target_response_id, target_status in
    select id, status
    from public.responses
    where deleted_at is null
      and status in ('sent_to_responding_team', 'accepted_by_responding_team', 'pcr_in_progress', 'pcr_completed')
  loop
    perform public.sync_response_to_incident(target_response_id, target_status = 'pcr_completed');
  end loop;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_matviews
    where schemaname = 'public'
      and matviewname = 'mv_barangay_incident_counts'
  ) then
    refresh materialized view public.mv_barangay_incident_counts;
  end if;
end $$;

revoke execute on function public.normalized_barangay_lookup(text) from public, anon;
grant execute on function public.normalized_barangay_lookup(text) to authenticated;

commit;
