-- Lightweight persisted location-confidence and manual-correction metadata.
-- Source/accuracy/level are stored in scraper_records.location_confidence to
-- avoid redundant columns. Dedicated columns are only added for auditability.

begin;

alter table public.scraper_records
  add column if not exists original_location_snapshot jsonb,
  add column if not exists location_corrected_by uuid references auth.users(id) on delete set null,
  add column if not exists location_corrected_at timestamptz;

create index if not exists scraper_records_location_corrected_idx
  on public.scraper_records(location_corrected_at desc)
  where location_corrected_at is not null and deleted_at is null;

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
  new.geocode_precision := case
    when new.location_confidence ->> 'corrected' = 'true' then new.geocode_precision
    else coalesce(nullif(new.raw_payload ->> 'geocode_precision', ''), new.geocode_precision)
  end;
  new.match_confidence := greatest(
    0,
    least(1, coalesce(nullif(new.raw_payload ->> 'geocode_confidence', '')::numeric, new.match_confidence, 0))
  );

  if new.location_confidence ->> 'corrected' = 'true' then
    new.mapping_status := case
      when new.location_confidence ->> 'accuracy' = 'unmapped' then 'needs_review'
      when new.latitude is not null and new.longitude is not null then 'exact_geocode'
      else 'matched_barangay'
    end;
    return new;
  end if;

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

commit;
