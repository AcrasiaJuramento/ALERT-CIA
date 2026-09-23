-- Keep the public Active Incidents aggregate aligned with the Admin
-- Incident & Accident List. The unit being counted is an incident record,
-- while linked dispatch/PCR statuses determine whether its workflow is done.
begin;

create or replace function public.get_public_active_incident_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(i.id)::integer
  from public.incidents i
  where i.deleted_at is null
    and (
      exists (
        select 1
        from public.pcr_reports p
        where p.response_id = i.response_id
          and p.deleted_at is null
          and p.status::text = 'pending_admin_verification'
      )
      or exists (
        select 1
        from public.dispatch_forms d
        where d.response_id = i.response_id
          and d.deleted_at is null
          and d.status::text = 'pending_admin_verification'
      )
      or (
        i.status::text not in ('completed', 'pcr_completed')
        and not exists (
          select 1
          from public.pcr_reports p
          where p.response_id = i.response_id
            and p.deleted_at is null
            and p.status::text in ('pcr_completed', 'submitted', 'completed', 'verified')
        )
        and not exists (
          select 1
          from public.dispatch_forms d
          where d.response_id = i.response_id
            and d.deleted_at is null
            and d.status::text in ('pcr_completed', 'submitted', 'completed', 'verified')
        )
      )
    );
$$;

revoke all on function public.get_public_active_incident_count() from public;
grant execute on function public.get_public_active_incident_count() to anon, authenticated;

commit;
