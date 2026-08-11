-- Phase 1 scraper quality metadata.
-- Adds explainability for classification/location decisions without changing
-- the operational Dispatch -> PCR -> official incident workflow.

begin;

alter table public.scraped_incidents
  add column if not exists classification_confidence text,
  add column if not exists classification_score numeric(5,4) not null default 0,
  add column if not exists classification_reason text,
  add column if not exists matched_terms text[] not null default '{}'::text[],
  add column if not exists article_content_hash text,
  add column if not exists raw_location_text text,
  add column if not exists purok_sitio text,
  add column if not exists location_confidence jsonb not null default '{}'::jsonb,
  add column if not exists vehicle_types text[] not null default '{}'::text[],
  add column if not exists injured_count integer check (injured_count is null or injured_count >= 0),
  add column if not exists fatality_count integer check (fatality_count is null or fatality_count >= 0),
  add column if not exists involved_parties text[] not null default '{}'::text[];

alter table public.scraper_records
  add column if not exists classification_confidence text,
  add column if not exists classification_score numeric(5,4) not null default 0,
  add column if not exists classification_reason text,
  add column if not exists article_content_hash text,
  add column if not exists purok_sitio text,
  add column if not exists location_confidence jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.scraped_incidents
    add constraint scraped_incidents_classification_confidence_check
    check (classification_confidence is null or classification_confidence in ('high', 'medium', 'low'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.scraper_records
    add constraint scraper_records_classification_confidence_check
    check (classification_confidence is null or classification_confidence in ('high', 'medium', 'low'));
exception when duplicate_object then null;
end $$;

create table if not exists public.scraper_article_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.scraper_runs(id) on delete set null,
  source_id uuid references public.scraper_sources(id) on delete set null,
  source_site text not null,
  source_url text not null,
  source_hash text not null,
  article_content_hash text,
  title text,
  snippet text,
  published_at timestamptz,
  detected_incident_type text,
  classification_confidence text,
  classification_score numeric(5,4) not null default 0,
  classification_reason text,
  matched_terms text[] not null default '{}'::text[],
  rejection_reason text not null,
  rejection_details text,
  raw_location_text text,
  extracted_province text,
  extracted_municipality text,
  extracted_barangay text,
  extracted_purok_sitio text,
  extracted_road text,
  location_confidence jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint scraper_article_candidates_confidence_check
    check (classification_confidence is null or classification_confidence in ('high', 'medium', 'low')),
  constraint scraper_article_candidates_rejection_reason_check
    check (rejection_reason in (
      'non_accident',
      'non_vehicular',
      'outside_isabela',
      'duplicate',
      'location_unknown',
      'low_confidence',
      'insufficient_information',
      'fetch_failed',
      'extract_failed',
      'database_error'
    ))
);

create unique index if not exists scraper_article_candidates_source_url_run_uidx
  on public.scraper_article_candidates(source_url, run_id);
create index if not exists scraper_article_candidates_reason_idx
  on public.scraper_article_candidates(rejection_reason, created_at desc);
create index if not exists scraper_article_candidates_source_idx
  on public.scraper_article_candidates(source_site, created_at desc);
create index if not exists scraped_incidents_content_hash_idx
  on public.scraped_incidents(article_content_hash)
  where article_content_hash is not null;

alter table public.scraper_article_candidates enable row level security;

drop policy if exists admin_all_scraper_article_candidates on public.scraper_article_candidates;
drop policy if exists staff_read_scraper_article_candidates on public.scraper_article_candidates;

create policy admin_all_scraper_article_candidates on public.scraper_article_candidates
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy staff_read_scraper_article_candidates on public.scraper_article_candidates
for select to authenticated
using (public.is_admin() or public.is_dispatcher());

grant select on public.scraper_article_candidates to authenticated;
grant insert, update, delete on public.scraper_article_candidates to authenticated;

commit;
