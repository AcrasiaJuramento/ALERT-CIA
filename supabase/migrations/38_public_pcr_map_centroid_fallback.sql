-- Ensure verified/completed PCR records can appear on public maps even when the
-- linked incident row has no explicit latitude/longitude yet. Falls back to the
-- response barangay centroid and returns only public-safe fields.

begin;

alter table public.responses
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists location_geography extensions.geography(point, 4326),
  add column if not exists location_text text;

create or replace function public.public_pcr_map_incidents(max_rows integer default 100)
returns table (
  pcr_id uuid,
  incident_id uuid,
  response_id uuid,
  classification text,
  priority text,
  location_text text,
  barangay text,
  latitude numeric,
  longitude numeric,
  incident_date date,
  incident_time time,
  incident_status text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    p.id as pcr_id,
    i.id as incident_id,
    p.response_id,
    coalesce(i.classification::text, public.classify_response_incident(coalesce(p.incident_nature, r.type_of_incident))::text) as classification,
    coalesce(i.priority::text, public.priority_from_pcr_triage(p.triage)::text, 'medium') as priority,
    coalesce(i.location_text, r.location_text, r.place_of_incident, b.name) as location_text,
    b.name as barangay,
    coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)) as latitude,
    coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)) as longitude,
    coalesce(i.incident_date, r.date_of_incident, p.completed_at::date, p.submitted_at::date, p.created_at::date) as incident_date,
    coalesce(i.incident_time, r.time_of_incident) as incident_time,
    coalesce(i.status::text, case when p.status = 'completed' then 'completed' else 'on_scene' end) as incident_status
  from public.pcr_reports p
  left join public.responses r on r.id = p.response_id and r.deleted_at is null
  left join public.incidents i on i.response_id = p.response_id and i.deleted_at is null
  left join public.barangays b on b.id = coalesce(i.barangay_id, r.barangay_id)
  where p.deleted_at is null
    and p.status in ('verified', 'completed')
    and coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)) is not null
    and coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)) is not null
  order by p.updated_at desc
  limit greatest(1, least(coalesce(max_rows, 100), 500));
$$;

grant execute on function public.public_pcr_map_incidents(integer) to anon, authenticated;

commit;
