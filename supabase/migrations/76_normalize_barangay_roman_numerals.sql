-- Match barangay names that use roman numerals or digits, e.g. Minante II and Minante 2.

begin;

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
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(lower(coalesce(value, '')), '\mgeneral\M', 'gen', 'g'),
                    '\msanta\M', 'sta', 'g'
                  ),
                  '\msanto\M', 'sto', 'g'
                ),
                '\m(1|i|one|uno)\M', '1', 'g'
              ),
              '\m(2|ii|two|dos)\M', '2', 'g'
            ),
            '\m(3|iii|three|tres)\M', '3', 'g'
          ),
          '\m(4|iv|four|kwatro|cuatro)\M', '4', 'g'
        ),
        '\m(5|v|five|singko|cinco)\M', '5', 'g'
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

update public.scraper_records
set barangay_id = null
where deleted_at is null
  and extracted_barangay is not null
  and (
    public.normalized_barangay_lookup(extracted_barangay) like '%minante1%'
    or public.normalized_barangay_lookup(extracted_barangay) like '%minante2%'
  );

update public.scraper_records
set latitude = latitude
where deleted_at is null
  and extracted_barangay is not null
  and (
    public.normalized_barangay_lookup(extracted_barangay) like '%minante1%'
    or public.normalized_barangay_lookup(extracted_barangay) like '%minante2%'
  );

commit;
