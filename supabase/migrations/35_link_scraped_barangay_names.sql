-- Prefer explicit barangay + municipality text when linking scraper records.
-- Spatial boundary matching remains the fallback for records without a text match.

begin;

-- Barangay names repeat across municipalities, so province-wide data must be unique per municipality.
alter table public.barangays drop constraint if exists barangays_name_key;
alter table public.barangays drop constraint if exists barangays_normalized_name_key;
create unique index if not exists barangays_municipality_normalized_name_uidx
  on public.barangays(lower(trim(municipality)), normalized_name);

create or replace function public.normalized_barangay_lookup(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(value, '')), '\mgeneral\M', 'gen', 'g'),
          '\msanta\M', 'sta', 'g'
        ),
        '\msanto\M', 'sto', 'g'
      ),
      '(brgy\.?|barangay|bgy\.?|baryo|poblacion|province of isabela|isabela)',
      '',
      'g'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.set_scraper_record_barangay()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  extracted_barangay text := new.raw_payload #>> '{location,barangay}';
  extracted_municipality text := new.raw_payload #>> '{location,municipality}';
begin
  if new.barangay_id is null and nullif(trim(extracted_barangay), '') is not null then
    select b.id into new.barangay_id
    from public.barangays b
    where b.active
      and public.normalized_barangay_lookup(b.name) = public.normalized_barangay_lookup(extracted_barangay)
      and (
        nullif(trim(extracted_municipality), '') is null
        or lower(trim(b.municipality)) = lower(trim(extracted_municipality))
      )
    order by case when lower(trim(b.municipality)) = lower(trim(extracted_municipality)) then 0 else 1 end
    limit 1;
  end if;

  if new.barangay_id is null and new.location is not null then
    new.barangay_id := public.find_barangay_for_point(new.location);
  end if;
  return new;
end;
$$;

update public.scraper_records r
set barangay_id = b.id
from public.barangays b
where r.barangay_id is null
  and r.deleted_at is null
  and b.active
  and public.normalized_barangay_lookup(b.name) = public.normalized_barangay_lookup(r.raw_payload #>> '{location,barangay}')
  and lower(trim(b.municipality)) = lower(trim(r.raw_payload #>> '{location,municipality}'));

commit;
