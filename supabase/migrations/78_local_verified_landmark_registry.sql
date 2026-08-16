-- Lightweight local landmark registry for persisted scraper location matching.
-- This table is intentionally single-purpose and small: it is read during
-- scraping/correction, not during normal map marker rendering.

begin;

create table if not exists public.landmarks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (
    lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g'))
  ) stored,
  aliases text[] not null default '{}'::text[],
  category text not null default 'other' check (category in (
    'school',
    'church',
    'hospital',
    'clinic',
    'barangay hall',
    'government office',
    'police station',
    'fire station',
    'fuel station',
    'market',
    'bridge',
    'terminal',
    'commercial establishment',
    'intersection',
    'other'
  )),
  barangay text,
  municipality text not null default 'Echague',
  province text not null default 'Isabela',
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  location extensions.geography(point, 4326) generated always as (
    extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  detected_barangay_id uuid references public.barangays(id) on delete set null,
  detected_barangay text,
  detected_municipality text,
  validation_status text not null default 'pending' check (validation_status in ('pending', 'valid', 'conflict', 'outside_boundary')),
  verification_status text not null default 'unverified' check (verification_status in ('officer_verified', 'auto_validated', 'unverified', 'needs_review')),
  officer_verified boolean not null default false,
  source text not null default 'manual',
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function public.validate_landmark_location()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  matched public.barangays%rowtype;
begin
  new.updated_at := now();
  new.detected_barangay_id := public.find_barangay_for_point(new.location);

  if new.detected_barangay_id is null then
    new.detected_barangay := null;
    new.detected_municipality := null;
    new.validation_status := 'outside_boundary';
    if new.verification_status = 'auto_validated' then
      new.verification_status := 'needs_review';
    end if;
    return new;
  end if;

  select * into matched from public.barangays where id = new.detected_barangay_id;
  new.detected_barangay := matched.name;
  new.detected_municipality := matched.municipality;

  if new.municipality is not null and lower(trim(new.municipality)) <> lower(trim(matched.municipality)) then
    new.validation_status := 'conflict';
    if new.verification_status = 'auto_validated' then
      new.verification_status := 'needs_review';
    end if;
    return new;
  end if;

  if nullif(trim(coalesce(new.barangay, '')), '') is not null
    and public.normalized_barangay_lookup(new.barangay) <> public.normalized_barangay_lookup(matched.name) then
    new.validation_status := 'conflict';
    if new.verification_status = 'auto_validated' then
      new.verification_status := 'needs_review';
    end if;
    return new;
  end if;

  new.validation_status := 'valid';
  new.barangay := coalesce(nullif(trim(new.barangay), ''), matched.name);
  new.municipality := coalesce(nullif(trim(new.municipality), ''), matched.municipality);
  return new;
end;
$$;

drop trigger if exists validate_landmark_location on public.landmarks;
create trigger validate_landmark_location
before insert or update of latitude, longitude, barangay, municipality, verification_status
on public.landmarks
for each row execute function public.validate_landmark_location();

create unique index if not exists landmarks_source_uidx
  on public.landmarks(source, source_id);

create index if not exists landmarks_normalized_name_trgm_idx
  on public.landmarks using gin (normalized_name extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists landmarks_aliases_idx
  on public.landmarks using gin (aliases)
  where deleted_at is null;

create index if not exists landmarks_location_idx
  on public.landmarks using gist (location)
  where deleted_at is null;

create index if not exists landmarks_lookup_idx
  on public.landmarks(municipality, barangay, verification_status, validation_status)
  where deleted_at is null;

create unique index if not exists landmarks_manual_near_duplicate_uidx
  on public.landmarks(normalized_name, municipality, barangay, category)
  where deleted_at is null and source = 'officer';

alter table public.landmarks enable row level security;

drop policy if exists landmarks_staff_read on public.landmarks;
drop policy if exists landmarks_admin_write on public.landmarks;

create policy landmarks_staff_read on public.landmarks
for select to authenticated
using (deleted_at is null and (public.is_admin() or public.is_dispatcher()));

create policy landmarks_admin_write on public.landmarks
for all to authenticated
using (public.is_admin() or public.is_dispatcher())
with check (public.is_admin() or public.is_dispatcher());

grant select, insert, update on public.landmarks to authenticated;
grant select on public.landmarks to service_role;

commit;
