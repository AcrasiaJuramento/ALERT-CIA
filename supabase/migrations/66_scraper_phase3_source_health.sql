-- Phase 3 scraper operations monitoring.
-- Tracks per-source scraper health so administrators can spot broken publishers,
-- empty extraction runs, and recurring network failures.

begin;

create table if not exists public.scraper_source_health (
  source_id uuid primary key references public.scraper_sources(id) on delete cascade,
  source_key text not null,
  source_name text not null,
  status text not null default 'unknown'
    check (status in ('healthy', 'warning', 'failed', 'unknown')),
  last_scraped_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  pages_checked integer not null default 0 check (pages_checked >= 0),
  links_found integer not null default 0 check (links_found >= 0),
  articles_processed integer not null default 0 check (articles_processed >= 0),
  incidents_detected integer not null default 0 check (incidents_detected >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  cache_hits integer not null default 0 check (cache_hits >= 0),
  retries integer not null default 0 check (retries >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists scraper_source_health_status_idx
  on public.scraper_source_health(status, updated_at desc);

drop trigger if exists set_scraper_source_health_updated_at on public.scraper_source_health;
create trigger set_scraper_source_health_updated_at
before update on public.scraper_source_health
for each row execute function public.set_updated_at();

alter table public.scraper_source_health enable row level security;

drop policy if exists admin_all_scraper_source_health on public.scraper_source_health;
drop policy if exists staff_read_scraper_source_health on public.scraper_source_health;

create policy admin_all_scraper_source_health on public.scraper_source_health
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy staff_read_scraper_source_health on public.scraper_source_health
for select to authenticated
using (public.is_admin() or public.is_dispatcher());

grant select on public.scraper_source_health to authenticated;
grant insert, update, delete on public.scraper_source_health to authenticated;

commit;
