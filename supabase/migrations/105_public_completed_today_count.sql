-- Public dashboard metric: PCR records approved by an admin today.
-- Use the stored verification timestamp instead of the incident date so an
-- older response approved today is reflected immediately and consistently.
begin;

create or replace function public.get_public_completed_today_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct coalesce(p.response_id::text, p.id::text))::integer
  from public.pcr_reports p
  where p.deleted_at is null
    and p.status = 'verified'
    and p.verified_at >= (((now() at time zone 'Asia/Manila')::date) at time zone 'Asia/Manila')
    and p.verified_at < (((now() at time zone 'Asia/Manila')::date + 1) at time zone 'Asia/Manila');
$$;

revoke all on function public.get_public_completed_today_count() from public;
grant execute on function public.get_public_completed_today_count() to anon, authenticated;

commit;
