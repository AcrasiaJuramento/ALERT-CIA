-- One RLS-aware PCR dashboard count source for Web and Mobile.
create or replace function public.get_pcr_dashboard_counts()
returns table (
  pending_admin_review bigint,
  verified bigint,
  returned_rejected bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) filter (where status in ('submitted', 'completed', 'pending_dispatcher_review', 'pending_admin_verification')) as pending_admin_review,
    count(*) filter (where status = 'verified') as verified,
    count(*) filter (where status in ('returned_to_field_officer', 'returned_for_correction', 'rejected')) as returned_rejected
  from public.pcr_reports
  where deleted_at is null
    and archived_at is null;
$$;

revoke all on function public.get_pcr_dashboard_counts() from public;
grant execute on function public.get_pcr_dashboard_counts() to authenticated;
