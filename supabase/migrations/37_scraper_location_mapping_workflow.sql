-- Preserve every relevant scraper candidate while tracking location-mapping quality explicitly.

begin;

alter table public.scraper_records
  add column if not exists raw_location_text text,
  add column if not exists extracted_barangay text,
  add column if not exists extracted_municipality text,
  add column if not exists extracted_province text,
  add column if not exists geocode_precision text,
  add column if not exists match_confidence numeric(5,4) not null default 0,
  add column if not exists mapping_status text not null default 'needs_review';

do $$ begin
  alter table public.scraper_records
    add constraint scraper_records_match_confidence_check check (match_confidence between 0 and 1),
    add constraint scraper_records_mapping_status_check check (
      mapping_status in ('matched_barangay', 'exact_geocode', 'partial_match', 'unmatched_location', 'needs_review')
    );
exception when duplicate_object then null;
end $$;

create or replace function public.set_scraper_record_barangay()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  matched_barangay public.barangays%rowtype;
begin
  new.raw_location_text := coalesce(
    nullif(new.raw_payload ->> 'location_text', ''),
    nullif(new.location_text, ''),
    new.display_name
  );
  new.extracted_barangay := coalesce(
    nullif(new.raw_payload #>> '{location,barangay}', ''),
    new.extracted_barangay
  );
  new.extracted_municipality := coalesce(
    nullif(new.raw_payload #>> '{location,municipality}', ''),
    new.extracted_municipality
  );
  new.extracted_province := coalesce(
    nullif(new.raw_payload #>> '{location,province}', ''),
    new.extracted_province,
    case when coalesce(new.location_text, '') ilike '%isabela%' then 'Isabela' end
  );
  new.geocode_precision := coalesce(
    nullif(new.raw_payload ->> 'geocode_precision', ''),
    new.geocode_precision
  );
  new.match_confidence := greatest(
    0,
    least(1, coalesce(nullif(new.raw_payload ->> 'geocode_confidence', '')::numeric, new.match_confidence, 0))
  );

  if nullif(trim(new.extracted_barangay), '') is not null then
    select b.* into matched_barangay
    from public.barangays b
    where b.active
      and public.normalized_barangay_lookup(b.name) = public.normalized_barangay_lookup(new.extracted_barangay)
      and (
        nullif(trim(new.extracted_municipality), '') is null
        or lower(trim(b.municipality)) = lower(trim(new.extracted_municipality))
      )
    order by case when lower(trim(b.municipality)) = lower(trim(new.extracted_municipality)) then 0 else 1 end
    limit 1;

    if matched_barangay.id is not null then
      new.barangay_id := matched_barangay.id;
      new.mapping_status := 'matched_barangay';
      new.match_confidence := 1;
      if matched_barangay.centroid is not null then
        new.latitude := extensions.ST_Y(matched_barangay.centroid::geometry);
        new.longitude := extensions.ST_X(matched_barangay.centroid::geometry);
        new.display_name := concat('Barangay ', matched_barangay.name, ', ', matched_barangay.municipality, ', Isabela, Philippines');
        new.geocode_precision := 'barangay_master';
        new.raw_payload := jsonb_set(new.raw_payload, '{geocode_precision}', '"barangay_master"'::jsonb, true);
      elsif coalesce(new.geocode_precision, 'unknown') not in ('barangay', 'road') then
        new.latitude := null;
        new.longitude := null;
      end if;
    elsif new.geocode_precision in ('barangay', 'road') and new.latitude is not null and new.longitude is not null then
      new.barangay_id := null;
      new.mapping_status := 'exact_geocode';
    else
      new.barangay_id := null;
      new.mapping_status := 'unmatched_location';
      new.latitude := null;
      new.longitude := null;
    end if;
  elsif nullif(trim(new.extracted_municipality), '') is not null then
    new.mapping_status := case
      when new.latitude is not null and new.longitude is not null then 'partial_match'
      else 'needs_review'
    end;
    new.match_confidence := least(new.match_confidence, 0.65);
    new.barangay_id := null;
    if new.geocode_precision in ('barangay', 'road') and new.location is not null then
      new.barangay_id := public.find_barangay_for_point(new.location);
    end if;
  else
    new.mapping_status := 'needs_review';
  end if;
  return new;
end;
$$;

drop trigger if exists set_scraper_record_barangay on public.scraper_records;
create trigger set_scraper_record_barangay
before insert or update of raw_payload, location_text, latitude, longitude, barangay_id on public.scraper_records
for each row execute function public.set_scraper_record_barangay();

update public.scraper_records r
set raw_location_text = coalesce(nullif(r.raw_payload ->> 'location_text', ''), r.location_text, i.location_text),
    extracted_barangay = coalesce(nullif(r.raw_payload #>> '{location,barangay}', ''), i.barangay),
    extracted_municipality = coalesce(nullif(r.raw_payload #>> '{location,municipality}', ''), i.municipality),
    extracted_province = coalesce(nullif(r.raw_payload #>> '{location,province}', ''), 'Isabela'),
    geocode_precision = coalesce(nullif(r.raw_payload ->> 'geocode_precision', ''),
      case when i.geocoded_from like 'barangay master:%' then 'barangay_master' end),
    match_confidence = greatest(coalesce(i.geocode_confidence, 0), coalesce(nullif(r.raw_payload ->> 'geocode_confidence', '')::numeric, 0)),
    latitude = r.latitude
from public.scraped_incidents i
where r.scraped_incident_id = i.id
  and r.deleted_at is null;

update public.scraper_records
set latitude = latitude
where deleted_at is null;

-- Include approved coordinate-null records so the client can resolve them through Isabela.geojson.
drop policy if exists anon_read_public_scraper_records on public.scraper_records;
create policy anon_read_public_scraper_records on public.scraper_records for select to anon
using (
  public_visible
  and status in ('approved', 'promoted', 'matched', 'imported')
  and deleted_at is null
);

create index if not exists scraper_records_mapping_status_idx
  on public.scraper_records(mapping_status, created_at desc) where deleted_at is null;
create index if not exists scraper_records_extracted_location_idx
  on public.scraper_records(extracted_municipality, extracted_barangay) where deleted_at is null;
create index if not exists scraper_records_created_idx
  on public.scraper_records(created_at desc) where deleted_at is null;

commit;
