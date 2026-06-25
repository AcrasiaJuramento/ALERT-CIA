-- Connect scraper records cleanly into the main ALERT-CIA map/incident workflow.
-- Scraped rows stay external until reviewed or promoted.

begin;

alter table public.scraper_records
  add column if not exists public_visible boolean not null default false,
  add column if not exists duplicate_key text;

alter table public.incidents
  add column if not exists record_origin text not null default 'official'
    check (record_origin in ('official', 'scraped', 'reviewed_scraped', 'promoted_scraped')),
  add column if not exists external_source_url text,
  add column if not exists scraper_record_id uuid references public.scraper_records(id) on delete set null;

create unique index if not exists scraper_records_duplicate_key_uidx
  on public.scraper_records(duplicate_key)
  where duplicate_key is not null and deleted_at is null;

create index if not exists scraper_records_public_map_idx
  on public.scraper_records(public_visible, status, category, scraped_at desc)
  where deleted_at is null and latitude is not null and longitude is not null;

create index if not exists scraper_records_severity_idx
  on public.scraper_records(severity, scraped_at desc)
  where deleted_at is null;

create index if not exists incidents_record_origin_idx
  on public.incidents(record_origin, incident_date desc)
  where deleted_at is null;

create or replace function public.promote_scraper_record_to_incident(target_record_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target public.scraper_records%rowtype;
  incident_id uuid;
  mapped_classification public.incident_classification;
  mapped_priority public.incident_priority;
begin
  select * into target
  from public.scraper_records
  where id = target_record_id and deleted_at is null;

  if not found then
    raise exception 'Scraper record not found';
  end if;

  if not public.is_admin() and not public.is_dispatcher() then
    raise exception 'Not authorized to promote scraper records';
  end if;

  mapped_classification := case
    when target.category = 'vehicular' then 'mvc'::public.incident_classification
    when target.incident_type = 'fire' then 'fire'::public.incident_classification
    when target.incident_type in ('flood', 'earthquake', 'landslide') then 'rescue'::public.incident_classification
    else 'other'::public.incident_classification
  end;

  mapped_priority := case
    when lower(coalesce(target.severity, '')) in ('black', 'red', 'critical') then 'critical'::public.incident_priority
    when lower(coalesce(target.severity, '')) in ('yellow', 'high') then 'high'::public.incident_priority
    when lower(coalesce(target.severity, '')) in ('green', 'low') then 'low'::public.incident_priority
    else 'medium'::public.incident_priority
  end;

  if target.related_incident_id is null then
    insert into public.incidents(
      barangay_id,
      classification,
      subtype,
      priority,
      title,
      description,
      incident_date,
      location_text,
      location,
      public_visible,
      status,
      record_origin,
      external_source_url,
      scraper_record_id
    )
    values (
      target.barangay_id,
      mapped_classification,
      target.incident_type,
      mapped_priority,
      target.title,
      target.snippet,
      target.scraped_at::date,
      coalesce(target.location_text, target.display_name),
      target.location,
      target.public_visible,
      'draft',
      'promoted_scraped',
      target.source_url,
      target.id
    )
    returning id into incident_id;
  else
    incident_id := target.related_incident_id;
  end if;

  update public.scraper_records
  set related_incident_id = incident_id,
      status = 'imported',
      public_visible = true,
      processed_at = now()
  where id = target_record_id;

  return incident_id;
end;
$$;

drop policy if exists anon_read_public_scraper_records on public.scraper_records;
drop policy if exists officer_read_scraper_records on public.scraper_records;
drop policy if exists admin_dispatch_read_scraper_records on public.scraper_records;
drop policy if exists dispatcher_update_scraper_records on public.scraper_records;

create policy anon_read_public_scraper_records on public.scraper_records for select to anon
using (
  public_visible
  and status in ('matched', 'imported')
  and deleted_at is null
  and latitude is not null
  and longitude is not null
);

create policy officer_read_scraper_records on public.scraper_records for select to authenticated
using (public.is_admin() or public.is_dispatcher() or public.is_field_responder());

create policy dispatcher_update_scraper_records on public.scraper_records for update to authenticated
using (public.is_admin() or public.is_dispatcher())
with check (public.is_admin() or public.is_dispatcher());

grant usage on schema public to anon;
grant select on public.scraper_records to anon;

commit;
