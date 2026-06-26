-- Keep map coordinates queryable and expose only approved public map data.

begin;

alter table public.incidents
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7);

update public.incidents
set
  latitude = extensions.ST_Y(location::extensions.geometry),
  longitude = extensions.ST_X(location::extensions.geometry)
where location is not null
  and (latitude is null or longitude is null);

create or replace function public.sync_incident_location_columns()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := extensions.ST_SetSRID(extensions.ST_MakePoint(new.longitude, new.latitude), 4326)::extensions.geography;
  elsif new.location is not null then
    new.latitude := extensions.ST_Y(new.location::extensions.geometry);
    new.longitude := extensions.ST_X(new.location::extensions.geometry);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_incident_location_columns on public.incidents;
create trigger sync_incident_location_columns
before insert or update of latitude, longitude, location on public.incidents
for each row execute function public.sync_incident_location_columns();

drop policy if exists anon_read_public_incidents on public.incidents;
create policy anon_read_public_incidents on public.incidents for select to anon
using (
  public_visible
  and deleted_at is null
  and status in ('sent_to_responding_team', 'accepted_by_responding_team', 'pcr_in_progress', 'pcr_completed')
);

create index if not exists incidents_public_map_idx
  on public.incidents(public_visible, incident_date desc)
  where deleted_at is null and latitude is not null and longitude is not null;

grant select on public.incidents to anon;

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
set search_path = public, pg_temp
as $$
  select
    p.id as pcr_id,
    i.id as incident_id,
    p.response_id,
    i.classification::text,
    i.priority::text,
    coalesce(i.location_text, r.place_of_incident, b.name) as location_text,
    b.name as barangay,
    i.latitude,
    i.longitude,
    coalesce(i.incident_date, r.date_of_incident) as incident_date,
    coalesce(i.incident_time, r.time_of_incident) as incident_time,
    i.status::text as incident_status
  from public.pcr_reports p
  join public.incidents i on i.response_id = p.response_id
  left join public.responses r on r.id = p.response_id
  left join public.barangays b on b.id = coalesce(i.barangay_id, r.barangay_id)
  where p.deleted_at is null
    and p.status in ('verified', 'completed')
    and i.public_visible
    and i.deleted_at is null
    and i.latitude is not null
    and i.longitude is not null
  order by p.updated_at desc
  limit greatest(1, least(coalesce(max_rows, 100), 500));
$$;

grant execute on function public.public_pcr_map_incidents(integer) to anon, authenticated;

commit;
