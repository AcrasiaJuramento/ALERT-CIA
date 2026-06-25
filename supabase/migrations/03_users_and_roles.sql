-- Users, profiles, and role assignment.
-- Supabase auth.users remains the identity source of truth.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  address text,
  contact_number text,
  location extensions.geography(point, 4326),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  display_name text not null,
  email text,
  contact_number text,
  position_title text,
  account_status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.profiles p on p.id = pr.profile_id
    where pr.profile_id = auth.uid()
      and pr.role = required_role
      and p.account_status = 'active'
      and p.deleted_at is null
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('administrator');
$$;

create or replace function public.is_dispatcher()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('dispatcher');
$$;

create or replace function public.is_field_responder()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('field_responder');
$$;

create or replace function public.current_station_id()
returns uuid language sql stable security definer set search_path = public as $$
  select station_id from public.profiles where id = auth.uid() and deleted_at is null;
$$;

commit;
