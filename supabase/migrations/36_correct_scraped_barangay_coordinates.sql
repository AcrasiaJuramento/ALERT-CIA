-- Explicit article barangay names take precedence over imprecise municipality geocodes.

begin;

create or replace function public.set_scraper_record_barangay()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  extracted_barangay text := new.raw_payload #>> '{location,barangay}';
  extracted_municipality text := new.raw_payload #>> '{location,municipality}';
  extracted_precision text := new.raw_payload ->> 'geocode_precision';
  matched_barangay public.barangays%rowtype;
begin
  if nullif(trim(extracted_barangay), '') is not null then
    select b.* into matched_barangay
    from public.barangays b
    where b.active
      and public.normalized_barangay_lookup(b.name) = public.normalized_barangay_lookup(extracted_barangay)
      and (
        nullif(trim(extracted_municipality), '') is null
        or lower(trim(b.municipality)) = lower(trim(extracted_municipality))
      )
    order by case when lower(trim(b.municipality)) = lower(trim(extracted_municipality)) then 0 else 1 end
    limit 1;

    if matched_barangay.id is not null then
      new.barangay_id := matched_barangay.id;
      if matched_barangay.centroid is not null then
        new.latitude := extensions.ST_Y(matched_barangay.centroid::geometry);
        new.longitude := extensions.ST_X(matched_barangay.centroid::geometry);
        new.display_name := concat('Barangay ', matched_barangay.name, ', ', matched_barangay.municipality, ', Isabela, Philippines');
        new.raw_payload := jsonb_set(new.raw_payload, '{geocode_precision}', '"barangay_master"'::jsonb, true);
      elsif coalesce(extracted_precision, 'unknown') not in ('barangay', 'road') then
        new.latitude := null;
        new.longitude := null;
      end if;
    else
      new.barangay_id := null;
      if coalesce(extracted_precision, 'unknown') not in ('barangay', 'road') then
        new.latitude := null;
        new.longitude := null;
      end if;
    end if;
  elsif new.barangay_id is null and new.location is not null then
    new.barangay_id := public.find_barangay_for_point(new.location);
  end if;
  return new;
end;
$$;

-- Correct existing rows, even if an old town-center point linked them to the wrong barangay.
update public.scraper_records r
set barangay_id = b.id,
    latitude = case when b.centroid is not null then extensions.ST_Y(b.centroid::geometry) else null end,
    longitude = case when b.centroid is not null then extensions.ST_X(b.centroid::geometry) else null end,
    display_name = concat('Barangay ', b.name, ', ', b.municipality, ', Isabela, Philippines'),
    raw_payload = jsonb_set(r.raw_payload, '{geocode_precision}', '"barangay_master"'::jsonb, true)
from public.barangays b
where r.deleted_at is null
  and b.active
  and nullif(trim(r.raw_payload #>> '{location,barangay}'), '') is not null
  and public.normalized_barangay_lookup(b.name) = public.normalized_barangay_lookup(r.raw_payload #>> '{location,barangay}')
  and lower(trim(b.municipality)) = lower(trim(r.raw_payload #>> '{location,municipality}'));

-- Hide explicit-barangay records whose only coordinate is an unsafe municipality fallback.
update public.scraper_records r
set barangay_id = null,
    latitude = null,
    longitude = null
where r.deleted_at is null
  and nullif(trim(r.raw_payload #>> '{location,barangay}'), '') is not null
  and coalesce(r.raw_payload ->> 'geocode_precision', 'unknown') not in ('barangay', 'road', 'barangay_master')
  and not exists (
    select 1 from public.barangays b
    where b.active
      and public.normalized_barangay_lookup(b.name) = public.normalized_barangay_lookup(r.raw_payload #>> '{location,barangay}')
      and lower(trim(b.municipality)) = lower(trim(r.raw_payload #>> '{location,municipality}'))
  );

update public.scraped_incidents i
set latitude = extensions.ST_Y(b.centroid::geometry),
    longitude = extensions.ST_X(b.centroid::geometry),
    display_name = concat('Barangay ', b.name, ', ', b.municipality, ', Isabela, Philippines'),
    geocoded_from = concat('barangay master: ', b.name, ', ', b.municipality),
    geocode_status = 'success',
    geocode_confidence = 1
from public.barangays b
where b.active
  and b.centroid is not null
  and public.normalized_barangay_lookup(b.name) = public.normalized_barangay_lookup(i.barangay)
  and lower(trim(b.municipality)) = lower(trim(i.municipality));

commit;
