-- GIS boundary support for analytics heatmaps and future municipality/province expansion.
-- Official boundary files should be imported as WGS84 GeoJSON/SHP/KML-derived geometries.

begin;

create extension if not exists postgis with schema extensions;

create table if not exists public.gis_areas (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.gis_areas(id) on delete cascade,
  area_code text not null unique,
  area_name text not null,
  area_type text not null check (area_type in ('country', 'region', 'province', 'municipality', 'barangay')),
  source_name text not null,
  source_url text,
  source_format text not null check (source_format in ('geojson', 'shp', 'kml', 'kmz')),
  source_file_name text,
  source_imported_at timestamptz not null default now(),
  boundary extensions.geometry(multipolygon, 4326) not null,
  centroid extensions.geography(point, 4326) generated always as (extensions.ST_Centroid(boundary)::extensions.geography) stored,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (extensions.ST_IsValid(boundary))
);

create index if not exists gis_areas_parent_idx on public.gis_areas(parent_id);
create index if not exists gis_areas_type_idx on public.gis_areas(area_type) where deleted_at is null;
create index if not exists gis_areas_boundary_gix on public.gis_areas using gist(boundary);

create table if not exists public.gis_import_batches (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.gis_areas(id) on delete set null,
  import_name text not null,
  source_format text not null check (source_format in ('geojson', 'shp', 'kml', 'kmz')),
  source_file_name text not null,
  feature_count integer not null default 0 check (feature_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'validated', 'imported', 'rejected', 'failed')),
  validation_errors jsonb not null default '[]'::jsonb,
  imported_by uuid references public.profiles(id) on delete set null default auth.uid(),
  imported_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.find_barangay_for_point(target_location extensions.geography)
returns uuid language sql stable set search_path = public, extensions as $$
  select id
  from public.gis_areas
  where area_type = 'barangay'
    and active
    and deleted_at is null
    and ST_Covers(boundary, target_location::geometry)
  order by ST_Area(boundary::geography) asc
  limit 1;
$$;

create or replace view public.incidents_with_barangay as
select
  i.*,
  b.id as barangay_area_id,
  b.area_name as barangay_name,
  m.id as municipality_area_id,
  m.area_name as municipality_name
from public.incidents i
left join lateral (
  select *
  from public.gis_areas g
  where g.area_type = 'barangay'
    and g.active
    and g.deleted_at is null
    and extensions.ST_Covers(g.boundary, i.location::extensions.geometry)
  order by extensions.ST_Area(g.boundary::extensions.geography) asc
  limit 1
) b on true
left join public.gis_areas m on m.id = b.parent_id and m.area_type = 'municipality';

alter table public.gis_areas enable row level security;
alter table public.gis_import_batches enable row level security;

drop policy if exists gis_areas_staff_read on public.gis_areas;
create policy gis_areas_staff_read on public.gis_areas for select to authenticated
using (public.is_staff() and deleted_at is null);

drop policy if exists gis_areas_admin_manage on public.gis_areas;
create policy gis_areas_admin_manage on public.gis_areas for all to authenticated
using (public.has_role('administrator'))
with check (public.has_role('administrator'));

drop policy if exists gis_import_staff_read on public.gis_import_batches;
create policy gis_import_staff_read on public.gis_import_batches for select to authenticated
using (public.is_staff());

drop policy if exists gis_import_admin_manage on public.gis_import_batches;
create policy gis_import_admin_manage on public.gis_import_batches for all to authenticated
using (public.has_role('administrator'))
with check (public.has_role('administrator'));

grant select on public.gis_areas, public.gis_import_batches, public.incidents_with_barangay to authenticated;
grant insert, update, delete on public.gis_areas, public.gis_import_batches to authenticated;
grant execute on function public.find_barangay_for_point(extensions.geography) to authenticated;

commit;
