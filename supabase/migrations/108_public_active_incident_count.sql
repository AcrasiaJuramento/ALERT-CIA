-- Public dashboard aggregate for ongoing dispatch/response workflows.
-- It intentionally does not depend on map coordinates, PCR verification, or
-- scraper records, so sending/accepting a dispatch updates the metric.
begin;

create or replace function public.get_public_active_incident_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct response.id)::integer
  from public.responses response
  where response.deleted_at is null
    and response.status::text in (
      'dispatched',
      'sent_to_responding_team',
      'accepted_by_responding_team',
      'in_route',
      'on_scene',
      'transporting',
      'pcr_in_progress'
    );
$$;

revoke all on function public.get_public_active_incident_count() from public;
grant execute on function public.get_public_active_incident_count() to anon, authenticated;

commit;
