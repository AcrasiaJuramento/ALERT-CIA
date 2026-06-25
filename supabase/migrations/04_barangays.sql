-- Echague barangay master data and GIS boundaries.

begin;

create table if not exists public.barangays (
  id uuid primary key default gen_random_uuid(),
  psgc_code text unique,
  name text not null unique,
  normalized_name text not null unique,
  municipality text not null default 'Echague',
  province text not null default 'Isabela',
  boundary extensions.geometry(multipolygon, 4326),
  centroid extensions.geography(point, 4326),
  source_name text,
  source_url text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (boundary is null or extensions.ST_IsValid(boundary))
);

create table if not exists public.gis_import_batches (
  id uuid primary key default gen_random_uuid(),
  import_name text not null,
  source_file_name text,
  source_format text not null default 'geojson',
  feature_count integer not null default 0 check (feature_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'validated', 'imported', 'rejected', 'failed')),
  validation_errors jsonb not null default '[]'::jsonb,
  imported_by uuid references public.profiles(id) on delete set null,
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.find_barangay_for_point(target_location extensions.geography)
returns uuid
language sql
stable
set search_path = public, extensions
as $$
  select id
  from public.barangays
  where active
    and boundary is not null
    and ST_Covers(boundary, target_location::geometry)
  order by ST_Area(boundary::geography) asc
  limit 1;
$$;

commit;
