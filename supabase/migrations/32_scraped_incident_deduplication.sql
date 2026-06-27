-- Store one canonical scraped incident with any number of reporting sources.
-- scraper_records remains the review/map compatibility layer, one row per canonical incident.

begin;

create table if not exists public.scraped_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  title text not null,
  snippet text,
  incident_type_key text not null,
  incident_type_label text not null,
  location_text text not null,
  municipality text not null,
  barangay text,
  road_place text,
  victim_count integer check (victim_count is null or victim_count >= 0),
  geocoded_from text,
  geocode_status text not null default 'pending' check (geocode_status in ('pending', 'success', 'failed')),
  geocode_confidence numeric(5,4) not null default 0 check (geocode_confidence between 0 and 1),
  latitude numeric(10,7),
  longitude numeric(10,7),
  location extensions.geography(point, 4326) generated always as (
    case when latitude is not null and longitude is not null
      then extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography
      else null end
  ) stored,
  display_name text,
  published_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source_count integer not null default 0 check (source_count >= 0),
  confidence_score numeric(5,4) not null default 0 check (confidence_score between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.incident_sources (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.scraped_incidents(id) on delete cascade,
  source_site text not null,
  source_url text not null unique,
  source_title text,
  source_snippet text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.scraper_records
  add column if not exists scraped_incident_id uuid references public.scraped_incidents(id) on delete set null;

-- Preserve existing reviewed scraper data and make it participate in exact-URL checks.
insert into public.scraped_incidents(
  incident_key, title, snippet, incident_type_key, incident_type_label,
  location_text, municipality, geocoded_from, geocode_status,
  geocode_confidence, latitude, longitude, display_name, published_at,
  first_seen_at, last_seen_at, confidence_score
)
select
  coalesce(r.duplicate_key, md5(lower(concat_ws('|', r.title, r.location_text, r.incident_type, r.scraped_at::date)))),
  coalesce(r.title, 'Untitled scraped incident'),
  r.snippet,
  coalesce(r.incident_type, 'unknown'),
  initcap(replace(coalesce(r.incident_type, 'unknown'), '_', ' ')),
  coalesce(r.location_text, r.display_name, 'Isabela, Philippines'),
  coalesce((regexp_match(coalesce(r.location_text, ''), '([^,]+),\s*Isabela', 'i'))[1], 'Isabela'),
  r.location_text,
  case when r.latitude is not null and r.longitude is not null then 'success' else 'failed' end,
  case when r.latitude is not null and r.longitude is not null then 0.5 else 0 end,
  r.latitude,
  r.longitude,
  r.display_name,
  r.scraped_at,
  r.created_at,
  greatest(r.updated_at, r.scraped_at),
  0.5
from public.scraper_records r
where r.deleted_at is null
on conflict (incident_key) do nothing;

update public.scraper_records r
set scraped_incident_id = i.id
from public.scraped_incidents i
where i.incident_key = coalesce(r.duplicate_key, md5(lower(concat_ws('|', r.title, r.location_text, r.incident_type, r.scraped_at::date))))
  and r.scraped_incident_id is null;

insert into public.incident_sources(incident_id, source_site, source_url, source_title, source_snippet, published_at, created_at)
select r.scraped_incident_id, r.source_site, r.source_url, r.title, r.snippet, r.scraped_at, r.created_at
from public.scraper_records r
where r.scraped_incident_id is not null and r.deleted_at is null
on conflict (source_url) do nothing;

create unique index if not exists scraper_records_scraped_incident_uidx
  on public.scraper_records(scraped_incident_id)
  where scraped_incident_id is not null and deleted_at is null;
create index if not exists scraped_incidents_type_date_idx
  on public.scraped_incidents(incident_type_key, published_at desc);
create index if not exists scraped_incidents_location_gix
  on public.scraped_incidents using gist(location);
create index if not exists scraped_incidents_title_trgm_idx
  on public.scraped_incidents using gin(title gin_trgm_ops);
create index if not exists incident_sources_incident_idx
  on public.incident_sources(incident_id, published_at desc);

create or replace function public.refresh_scraped_incident_source_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_id uuid;
begin
  target_id := case when tg_op = 'DELETE' then old.incident_id else new.incident_id end;
  update public.scraped_incidents
  set source_count = (select count(*) from public.incident_sources where incident_id = target_id),
      last_seen_at = now(),
      updated_at = now()
  where id = target_id;
  if tg_op = 'UPDATE' and old.incident_id is distinct from new.incident_id then
    update public.scraped_incidents
    set source_count = (select count(*) from public.incident_sources where incident_id = old.incident_id),
        updated_at = now()
    where id = old.incident_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists refresh_scraped_incident_source_count on public.incident_sources;
create trigger refresh_scraped_incident_source_count
after insert or delete or update of incident_id on public.incident_sources
for each row execute function public.refresh_scraped_incident_source_count();

update public.scraped_incidents i
set source_count = (select count(*) from public.incident_sources s where s.incident_id = i.id);

drop trigger if exists set_scraped_incidents_updated_at on public.scraped_incidents;
create trigger set_scraped_incidents_updated_at
before update on public.scraped_incidents
for each row execute function public.set_updated_at();

alter table public.scraped_incidents enable row level security;
alter table public.incident_sources enable row level security;

create policy admin_all_scraped_incidents on public.scraped_incidents for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy staff_read_scraped_incidents on public.scraped_incidents for select to authenticated
using (public.is_admin() or public.is_dispatcher() or public.is_field_responder());
create policy admin_all_incident_sources on public.incident_sources for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy staff_read_incident_sources on public.incident_sources for select to authenticated
using (public.is_admin() or public.is_dispatcher() or public.is_field_responder());

grant select on public.scraped_incidents, public.incident_sources to authenticated;
grant insert, update, delete on public.scraped_incidents, public.incident_sources to authenticated;

commit;
