-- Admin-managed crew roster for dispatch and PCR form dropdowns.

begin;

create table if not exists public.crew_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('driver', 'main_aider', 'group_leader', 'assistant_aider')),
  contact_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (name, role)
);

create index if not exists crew_members_role_active_idx
  on public.crew_members(role, active, name)
  where deleted_at is null;

alter table public.crew_members enable row level security;

drop policy if exists "Authenticated users can read active crew roster" on public.crew_members;
create policy "Authenticated users can read active crew roster"
  on public.crew_members for select
  to authenticated
  using (deleted_at is null and (active = true or public.is_admin()));

drop policy if exists "Admins can manage crew roster" on public.crew_members;
create policy "Admins can manage crew roster"
  on public.crew_members for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
