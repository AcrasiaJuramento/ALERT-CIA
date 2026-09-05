-- Keep the legacy category column aligned with advisory_type for accident-prone advisory records.

begin;

alter table public.public_advisories
  drop constraint if exists public_advisories_category_check;

alter table public.public_advisories
  add constraint public_advisories_category_check
  check (category in ('flood', 'road_closure', 'weather', 'general', 'accident_prone_area'));

commit;
