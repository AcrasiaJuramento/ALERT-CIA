-- Phase 2 scraper review workflow metadata and duplicate merge support.

begin;

alter table public.scraped_incidents
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists needs_manual_review boolean not null default true,
  add column if not exists verified_municipality text,
  add column if not exists verified_barangay text,
  add column if not exists verified_purok_sitio text,
  add column if not exists verified_road_place text;

alter table public.scraper_records
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists needs_manual_review boolean not null default true,
  add column if not exists verified_municipality text,
  add column if not exists verified_barangay text,
  add column if not exists verified_purok_sitio text,
  add column if not exists verified_road_place text;

create index if not exists scraper_records_review_queue_idx
  on public.scraper_records(status, needs_manual_review, scraped_at desc)
  where deleted_at is null;

create or replace function public.merge_scraper_records(source_record_id uuid, target_record_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_record public.scraper_records%rowtype;
  target_record public.scraper_records%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not authorized to merge scraper records';
  end if;

  select * into source_record
  from public.scraper_records
  where id = source_record_id and deleted_at is null;

  select * into target_record
  from public.scraper_records
  where id = target_record_id and deleted_at is null;

  if source_record.id is null or target_record.id is null then
    raise exception 'Source or target scraper record not found';
  end if;

  if source_record.scraped_incident_id is not null and target_record.scraped_incident_id is not null then
    update public.incident_sources
    set incident_id = target_record.scraped_incident_id
    where incident_id = source_record.scraped_incident_id;
  end if;

  update public.scraper_records
  set status = 'ignored',
      public_visible = false,
      processed_at = now(),
      rejected_reason = concat('Merged duplicate into ', target_record_id::text),
      needs_manual_review = false,
      updated_at = now()
  where id = source_record_id;

  return target_record_id;
end;
$$;

grant execute on function public.merge_scraper_records(uuid, uuid) to authenticated;

commit;
