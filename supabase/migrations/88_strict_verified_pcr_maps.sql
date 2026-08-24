-- Maps must expose only PCR records explicitly verified by an administrator.
-- A submitted or completed PCR is not equivalent to approval.
create or replace function public.public_pcr_map_incidents(max_rows integer default 100)
returns table (
  pcr_id uuid, incident_id uuid, response_id uuid, classification text,
  priority text, triage text, location_text text, barangay text,
  latitude numeric, longitude numeric, incident_date date,
  incident_time time, incident_status text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with canonical_pcr as (
    select distinct on (p.response_id) p.*
    from public.pcr_reports p
    where p.deleted_at is null
      and p.response_id is not null
      and p.status = 'verified'
    order by p.response_id, p.updated_at desc nulls last
  )
  select
    p.id, i.id, p.response_id,
    coalesce(i.classification::text, public.classify_response_incident(coalesce(p.incident_nature, r.type_of_incident))::text),
    coalesce(i.priority::text, public.priority_from_pcr_triage(p.triage)::text, 'medium'),
    p.triage, coalesce(i.location_text, r.location_text, r.place_of_incident, b.name), b.name,
    coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)),
    coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)),
    coalesce(i.incident_date, r.date_of_incident, p.verified_at::date, p.submitted_at::date, p.created_at::date),
    coalesce(i.incident_time, r.time_of_incident),
    coalesce(i.status::text, 'on_scene')
  from canonical_pcr p
  left join public.responses r on r.id = p.response_id and r.deleted_at is null
  left join public.incidents i on i.response_id = p.response_id and i.deleted_at is null
  left join public.barangays b on b.id = coalesce(i.barangay_id, r.barangay_id)
  where coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)) is not null
    and coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)) is not null
  order by coalesce(i.incident_date, r.date_of_incident, p.verified_at::date, p.submitted_at::date, p.created_at::date) desc
  limit greatest(1, least(coalesce(max_rows, 100), 500));
$$;

grant execute on function public.public_pcr_map_incidents(integer) to anon, authenticated;
