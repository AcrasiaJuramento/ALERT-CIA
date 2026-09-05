-- Advisory image attachments and linked manual accident-prone zones.

begin;

alter table public.hazard_zones
  add column if not exists advisory_id uuid references public.public_advisories(id) on delete set null,
  add column if not exists source text not null default 'manual_admin';

create table if not exists public.public_advisory_media (
  id uuid primary key default gen_random_uuid(),
  advisory_id uuid not null references public.public_advisories(id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  size_bytes integer not null default 0 check (size_bytes >= 0),
  width integer,
  height integer,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.public_advisory_media enable row level security;

drop policy if exists admin_all_public_advisory_media on public.public_advisory_media;
drop policy if exists public_read_published_public_advisory_media on public.public_advisory_media;

create policy admin_all_public_advisory_media on public.public_advisory_media
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy public_read_published_public_advisory_media on public.public_advisory_media
for select to anon, authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.public_advisories advisory
    where advisory.id = advisory_id
      and advisory.status = 'published'
      and advisory.deleted_at is null
      and coalesce(advisory.starts_at, advisory.created_at, now()) <= now()
      and (advisory.expires_at is null or advisory.expires_at > now())
  )
);

create index if not exists public_advisory_media_advisory_idx
  on public.public_advisory_media(advisory_id, created_at desc)
  where deleted_at is null;

create index if not exists hazard_zones_manual_advisory_idx
  on public.hazard_zones(advisory_id, source, zone_type)
  where deleted_at is null;

grant select on public.public_advisory_media to anon, authenticated;
grant insert, update on public.public_advisory_media to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-advisory-media',
  'public-advisory-media',
  true,
  750000,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_read_public_advisory_media_objects on storage.objects;
drop policy if exists admin_manage_public_advisory_media_objects on storage.objects;

create policy public_read_public_advisory_media_objects
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'public-advisory-media');

create policy admin_manage_public_advisory_media_objects
on storage.objects
for all
to authenticated
using (bucket_id = 'public-advisory-media' and public.is_admin())
with check (bucket_id = 'public-advisory-media' and public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.public_advisory_media;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

notify pgrst, 'reload schema';

commit;
