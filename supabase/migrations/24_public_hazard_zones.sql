-- Public-safe hazard zones for Live Safety Navigation.

begin;

create table if not exists public.hazard_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone_type text not null default 'default'
    check (zone_type in ('accident_hotspot', 'flood_risk', 'fire_hazard', 'road_closure', 'default')),
  severity public.incident_priority not null default 'medium',
  description text,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  radius_meters integer not null default 250 check (radius_meters between 25 and 5000),
  public_visible boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.hazard_zones enable row level security;

drop policy if exists admin_all_hazard_zones on public.hazard_zones;
drop policy if exists staff_read_hazard_zones on public.hazard_zones;
drop policy if exists anon_read_public_hazard_zones on public.hazard_zones;

create policy admin_all_hazard_zones on public.hazard_zones for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy staff_read_hazard_zones on public.hazard_zones for select to authenticated
using (deleted_at is null);

create policy anon_read_public_hazard_zones on public.hazard_zones for select to anon
using (public_visible and deleted_at is null);

create index if not exists hazard_zones_public_idx
  on public.hazard_zones(public_visible, zone_type, updated_at desc)
  where deleted_at is null;

grant select on public.hazard_zones to anon, authenticated;
grant insert, update on public.hazard_zones to authenticated;

commit;
