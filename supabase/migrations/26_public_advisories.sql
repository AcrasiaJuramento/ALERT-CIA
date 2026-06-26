-- Public advisories used by the admin advisory module and public dashboard.

begin;

create table if not exists public.public_advisories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  severity text not null default 'warning'
    check (severity in ('critical', 'warning', 'moderate', 'resolved')),
  category text not null default 'general'
    check (category in ('flood', 'road_closure', 'weather', 'general')),
  area text not null default 'Echague, Isabela',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  status text not null default 'draft'
    check (status in ('published', 'draft')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists set_public_advisories_updated_at on public.public_advisories;
create trigger set_public_advisories_updated_at
before update on public.public_advisories
for each row execute function public.set_updated_at();

alter table public.public_advisories enable row level security;

drop policy if exists public_read_published_advisories on public.public_advisories;
drop policy if exists staff_read_advisories on public.public_advisories;
drop policy if exists admin_manage_advisories on public.public_advisories;

create policy public_read_published_advisories on public.public_advisories
for select to anon, authenticated
using (status = 'published' and deleted_at is null);

create policy staff_read_advisories on public.public_advisories
for select to authenticated
using (public.is_admin());

create policy admin_manage_advisories on public.public_advisories
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.public_advisories to anon, authenticated;
grant insert, update on public.public_advisories to authenticated;

commit;
