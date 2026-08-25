-- Phase 2 public data optimization: keep public map/log reads small and indexed.

begin;

create index if not exists incidents_public_map_light_idx
  on public.incidents(public_visible, incident_date desc, updated_at desc)
  where deleted_at is null
    and latitude is not null
    and longitude is not null;

create index if not exists incidents_public_map_type_idx
  on public.incidents(classification, priority, incident_date desc)
  where public_visible = true
    and deleted_at is null
    and latitude is not null
    and longitude is not null;

create index if not exists scraper_records_public_light_idx
  on public.scraper_records(public_visible, status, scraped_at desc)
  where deleted_at is null
    and latitude is not null
    and longitude is not null;

create index if not exists pcr_reports_public_map_verified_idx
  on public.pcr_reports(status, created_at desc)
  where deleted_at is null
    and response_id is not null;

commit;
