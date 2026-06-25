-- Database-side cache tables for dashboard, analytics, reports, and GIS summaries.
-- The database remains the source of truth; cache rows are temporary derived data.

begin;

create table if not exists public.app_cache (
  cache_key text primary key,
  scope public.cache_scope not null,
  payload jsonb not null,
  expires_at timestamptz not null,
  refreshed_at timestamptz not null default now()
);

alter table public.app_cache enable row level security;

create policy admin_all_app_cache on public.app_cache for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy staff_read_fresh_app_cache on public.app_cache for select to authenticated
using (auth.uid() is not null and expires_at > now());
create policy staff_write_short_lived_app_cache on public.app_cache for insert to authenticated
with check (auth.uid() is not null and expires_at <= now() + interval '1 day');
create policy staff_update_short_lived_app_cache on public.app_cache for update to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null and expires_at <= now() + interval '1 day');

create materialized view if not exists public.mv_barangay_incident_counts as
select
  b.id as barangay_id,
  b.name as barangay_name,
  i.incident_date,
  count(i.id)::bigint as incident_count,
  count(*) filter (where i.priority = 'critical')::bigint as critical_count,
  count(*) filter (where i.priority = 'high')::bigint as high_count,
  count(*) filter (where i.priority = 'medium')::bigint as medium_count,
  count(*) filter (where i.priority = 'low')::bigint as low_count
from public.barangays b
left join public.incidents i on i.barangay_id = b.id and i.deleted_at is null
group by b.id, b.name, i.incident_date;

create unique index if not exists mv_barangay_incident_counts_uidx
  on public.mv_barangay_incident_counts(barangay_id, incident_date);

create or replace function public.clear_app_cache(target_scope public.cache_scope default null)
returns void language sql security definer set search_path = public as $$
  delete from public.app_cache
  where target_scope is null or scope = target_scope;
$$;

create or replace function public.invalidate_operational_cache()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.clear_app_cache('dashboard');
  perform public.clear_app_cache('analytics');
  perform public.clear_app_cache('reports');
  return coalesce(new, old);
end;
$$;

create or replace function public.invalidate_barangay_cache()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.clear_app_cache('barangay_map');
  perform public.clear_app_cache('dashboard');
  perform public.clear_app_cache('analytics');
  return coalesce(new, old);
end;
$$;

create or replace function public.refresh_barangay_incident_counts()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view public.mv_barangay_incident_counts;
end;
$$;

drop trigger if exists invalidate_cache_responses on public.responses;
create trigger invalidate_cache_responses after insert or update or delete on public.responses
for each row execute function public.invalidate_operational_cache();

drop trigger if exists invalidate_cache_incidents on public.incidents;
create trigger invalidate_cache_incidents after insert or update or delete on public.incidents
for each row execute function public.invalidate_operational_cache();

drop trigger if exists invalidate_cache_pcr on public.pcr_reports;
create trigger invalidate_cache_pcr after insert or update or delete on public.pcr_reports
for each row execute function public.invalidate_operational_cache();

drop trigger if exists invalidate_cache_barangays on public.barangays;
create trigger invalidate_cache_barangays after insert or update or delete on public.barangays
for each row execute function public.invalidate_barangay_cache();

grant select on public.app_cache, public.mv_barangay_incident_counts to authenticated;
grant insert, update, delete on public.app_cache to authenticated;
grant execute on function
  public.clear_app_cache(public.cache_scope),
  public.refresh_barangay_incident_counts()
to authenticated;

commit;
