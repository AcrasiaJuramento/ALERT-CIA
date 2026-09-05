-- Allow admin-created accident-prone advisory pins to use their own public advisory type.

begin;

alter table public.public_advisories
  drop constraint if exists public_advisories_advisory_type_check;

alter table public.public_advisories
  add constraint public_advisories_advisory_type_check
  check (advisory_type in ('flood', 'road_closure', 'weather', 'general', 'accident_prone_area'));

commit;
