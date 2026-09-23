-- Count Field Officers who are actually assigned to an ongoing response.
-- This replaces the former metric that counted every member of every active
-- team even when no dispatch was in progress.
begin;

create or replace function public.get_public_responding_field_officer_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct tm.profile_id)::integer
  from public.responses response
  join public.responding_teams team
    on team.id = response.responding_team_id
  join public.team_members tm
    on tm.team_id = team.id
   and tm.left_at is null
  join public.profiles profile
    on profile.id = tm.profile_id
  join public.profile_roles role
    on role.profile_id = profile.id
   and role.role = 'field_responder'
  where response.deleted_at is null
    and response.status::text in (
      'dispatched',
      'sent_to_responding_team',
      'accepted_by_responding_team',
      'in_route',
      'on_scene',
      'transporting',
      'pcr_in_progress'
    )
    and team.active
    and team.deleted_at is null
    and profile.deleted_at is null
    and profile.account_status = 'active';
$$;

revoke all on function public.get_public_responding_field_officer_count() from public;
grant execute on function public.get_public_responding_field_officer_count() to anon, authenticated;

-- Reuse the public empty-payload invalidation channel. No response or officer
-- details are broadcast; clients are only told to re-read the aggregate.
drop trigger if exists public_responses_cache_stale on public.responses;
create trigger public_responses_cache_stale
after insert or update or delete on public.responses
for each statement execute function public.broadcast_public_data_stale();

drop trigger if exists public_dispatch_forms_cache_stale on public.dispatch_forms;
create trigger public_dispatch_forms_cache_stale
after insert or update or delete on public.dispatch_forms
for each statement execute function public.broadcast_public_data_stale();

commit;
