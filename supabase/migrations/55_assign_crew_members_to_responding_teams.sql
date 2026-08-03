-- Allow admin-managed crew roster entries to be scoped to a responding team.

begin;

alter table if exists public.crew_members
  add column if not exists responding_team_id uuid references public.responding_teams(id) on delete set null;

create index if not exists crew_members_team_role_active_idx
  on public.crew_members(responding_team_id, role, active, name)
  where deleted_at is null;

commit;
