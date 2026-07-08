-- Store exact officer-pinned incident locations on the shared response record.
-- The synced incidents read model uses these exact coordinates instead of a
-- barangay centroid when present.

begin;

alter table public.responses
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists location_geography extensions.geography(point, 4326),
  add column if not exists location_text text;

update public.responses
set location_text = coalesce(location_text, place_of_incident)
where location_text is null
  and place_of_incident is not null;

create or replace function public.sync_response_location_columns()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location_geography := extensions.ST_SetSRID(extensions.ST_MakePoint(new.longitude, new.latitude), 4326)::extensions.geography;
  elsif new.location_geography is not null then
    new.latitude := extensions.ST_Y(new.location_geography::extensions.geometry);
    new.longitude := extensions.ST_X(new.location_geography::extensions.geometry);
  end if;

  new.location_text := coalesce(nullif(new.location_text, ''), nullif(new.place_of_incident, ''));
  return new;
end;
$$;

drop trigger if exists sync_response_location_columns on public.responses;
create trigger sync_response_location_columns
before insert or update of latitude, longitude, location_geography, location_text, place_of_incident
on public.responses
for each row execute function public.sync_response_location_columns();

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

  next_location := target_response.location_geography;

  if next_location is null and target_response.latitude is not null and target_response.longitude is not null then
    next_location := extensions.ST_SetSRID(extensions.ST_MakePoint(target_response.longitude, target_response.latitude), 4326)::extensions.geography;
  end if;

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
      latitude,
      longitude,
      public_visible,
      status,
      record_origin
    )
    values (
      target_response.id,
      target_response.barangay_id,
      next_classification,
      nullif(target_response.type_of_incident, ''),
      next_priority,
      next_title,
      next_description,
      coalesce(target_response.date_of_incident, current_date),
      target_response.time_of_incident,
      coalesce(nullif(target_response.location_text, ''), nullif(target_response.place_of_incident, ''), nullif(target_response.caller_address, '')),
      next_location,
      target_response.latitude,
      target_response.longitude,
      expose_public or target_response.status = 'pcr_completed',
      target_response.status,
      'official'
    )
    returning id into incident_id;
  else
    update public.incidents
    set barangay_id = coalesce(target_response.barangay_id, barangay_id),
        classification = next_classification,
        subtype = coalesce(nullif(target_response.type_of_incident, ''), subtype),
        priority = next_priority,
        title = next_title,
        description = next_description,
        incident_date = coalesce(target_response.date_of_incident, incident_date, current_date),
        incident_time = coalesce(target_response.time_of_incident, incident_time),
        location_text = coalesce(nullif(target_response.location_text, ''), nullif(target_response.place_of_incident, ''), nullif(target_response.caller_address, ''), location_text),
        location = coalesce(next_location, location),
        latitude = coalesce(target_response.latitude, latitude),
        longitude = coalesce(target_response.longitude, longitude),
        public_visible = public_visible or expose_public or target_response.status = 'pcr_completed',
        status = target_response.status,
        updated_at = now()
    where id = incident_id;
  end if;

  return incident_id;
end;
$$;

drop trigger if exists sync_response_to_incident_on_location on public.responses;
create trigger sync_response_to_incident_on_location
after update of latitude, longitude, location_geography, location_text
on public.responses
for each row
when (new.status in ('sent_to_responding_team', 'accepted_by_responding_team', 'pcr_in_progress', 'pcr_completed'))
execute function public.sync_response_incident_trigger();

grant execute on function public.sync_response_to_incident(uuid, boolean) to authenticated;

commit;
