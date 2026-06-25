-- Responding teams, members, and ambulance/unit records.

begin;

create table if not exists public.responding_teams (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  name text not null unique,
  status public.team_status not null default 'available',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.responding_teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_role text,
  is_leader boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (team_id, profile_id, joined_at)
);

create table if not exists public.ambulance_units (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  call_sign text not null unique,
  plate_number text unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.responding_teams(name)
select team_name
from (
  values
    ('Alpha Run 1'), ('Alpha Run 2'), ('Alpha Run 3'), ('Alpha Run 4'),
    ('Alpha Run 5'), ('Alpha Run 6'), ('Alpha Run 7'), ('Alpha Run 8'),
    ('Bravo Run 1'), ('Bravo Run 2'), ('Bravo Run 3'), ('Bravo Run 4'),
    ('Bravo Run 5'), ('Bravo Run 6'), ('Bravo Run 7'), ('Bravo Run 8'),
    ('Charlie Run 1'), ('Charlie Run 2'), ('Charlie Run 3'), ('Charlie Run 4'),
    ('Charlie Run 5'), ('Charlie Run 6'), ('Charlie Run 7'), ('Charlie Run 8')
) as seed(team_name)
on conflict (name) do nothing;

create or replace function public.user_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id
  from public.team_members tm
  where tm.profile_id = auth.uid()
    and tm.left_at is null;
$$;

commit;
