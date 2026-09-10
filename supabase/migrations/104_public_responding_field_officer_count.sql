-- Public aggregate for the dashboard's responding-account metric.
-- Exposes only a count, never officer IDs or profile fields.
begin;

create or replace function public.get_public_responding_field_officer_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct profile.id)::integer
  from public.team_members tm
  join public.profiles profile on profile.id = tm.profile_id
  join public.responding_teams team on team.id = tm.team_id
  join public.profile_roles role on role.profile_id = profile.id
  where tm.left_at is null
    and profile.deleted_at is null
    and profile.account_status = 'active'
    and role.role = 'field_responder'
    and team.active
    and team.deleted_at is null;
$$;

revoke all on function public.get_public_responding_field_officer_count() from public;
grant execute on function public.get_public_responding_field_officer_count() to anon, authenticated;

commit;
