-- ALERT-CIA scraper module.
-- Stores raw scraped news incident candidates and optionally promotes them into incidents.

begin;

do $$ begin
  create type public.scraper_record_status as enum ('new', 'matched', 'imported', 'ignored', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scraper_run_status as enum ('running', 'completed', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.scraper_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  base_url text not null,
  search_url text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scraper_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.scraper_sources(id) on delete set null,
  endpoint_type text not null default 'incidents' check (endpoint_type in ('incidents', 'vehicular', 'all')),
  status public.scraper_run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  ignored_count integer not null default 0 check (ignored_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scraper_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.scraper_sources(id) on delete set null,
  run_id uuid references public.scraper_runs(id) on delete set null,
  source_site text not null,
  source_url text not null,
  source_hash text not null unique,
  title text,
  snippet text,
  incident_type text,
  category text not null default 'incidents' check (category in ('incidents', 'vehicular')),
  severity text,
  location_text text,
  display_name text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  location extensions.geography(point, 4326) generated always as (
    case
      when latitude is not null and longitude is not null
      then extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography
      else null
    end
  ) stored,
  barangay_id uuid references public.barangays(id) on delete set null,
  related_incident_id uuid references public.incidents(id) on delete set null,
  public_visible boolean not null default false,
  duplicate_key text,
  status public.scraper_record_status not null default 'new',
  scraped_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint scraper_records_source_url_unique unique (source_url)
);

create table if not exists public.scraper_audit_logs (
  id uuid primary key default gen_random_uuid(),
  scraper_record_id uuid references public.scraper_records(id) on delete cascade,
  scraper_run_id uuid references public.scraper_runs(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null default auth.uid(),
  actor_label text not null default 'scraper-system',
  action_type text not null check (action_type in ('inserted', 'updated', 'matched', 'imported', 'ignored', 'failed', 'deleted')),
  previous_values jsonb,
  new_values jsonb,
  error_details text,
  created_at timestamptz not null default now()
);

insert into public.scraper_sources(source_key, name, base_url, search_url)
values ('bombo', 'Bombo Radyo News', 'https://news.bomboradyo.com', 'https://news.bomboradyo.com/?s=isabela')
on conflict (source_key) do update
set name = excluded.name,
    base_url = excluded.base_url,
    search_url = excluded.search_url,
    updated_at = now();

create index if not exists scraper_runs_source_status_idx on public.scraper_runs(source_id, status, started_at desc);
create index if not exists scraper_records_source_status_idx on public.scraper_records(source_id, status, scraped_at desc) where deleted_at is null;
create index if not exists scraper_records_category_type_idx on public.scraper_records(category, incident_type, scraped_at desc) where deleted_at is null;
create index if not exists scraper_records_barangay_idx on public.scraper_records(barangay_id, scraped_at desc) where deleted_at is null;
create index if not exists scraper_records_related_incident_idx on public.scraper_records(related_incident_id) where related_incident_id is not null;
create index if not exists scraper_records_location_gix on public.scraper_records using gist(location);
create index if not exists scraper_records_title_trgm_idx on public.scraper_records using gin(title gin_trgm_ops);
create unique index if not exists scraper_records_duplicate_key_uidx on public.scraper_records(duplicate_key) where duplicate_key is not null and deleted_at is null;
create index if not exists scraper_records_public_map_idx on public.scraper_records(public_visible, status, category, scraped_at desc) where deleted_at is null and latitude is not null and longitude is not null;
create index if not exists scraper_audit_record_idx on public.scraper_audit_logs(scraper_record_id, created_at desc);

create or replace function public.set_scraper_record_barangay()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.barangay_id is null and new.location is not null then
    new.barangay_id := public.find_barangay_for_point(new.location);
  end if;
  return new;
end;
$$;

create or replace function public.audit_scraper_record_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.scraper_audit_logs(scraper_record_id, scraper_run_id, action_type, new_values)
    values (new.id, new.run_id, 'inserted', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.scraper_audit_logs(scraper_record_id, scraper_run_id, action_type, previous_values, new_values)
    values (
      new.id,
      new.run_id,
      case
        when old.status <> new.status and new.status = 'matched' then 'matched'
        when old.status <> new.status and new.status = 'imported' then 'imported'
        when old.status <> new.status and new.status = 'ignored' then 'ignored'
        when old.status <> new.status and new.status = 'failed' then 'failed'
        else 'updated'
      end,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.scraper_audit_logs(scraper_record_id, scraper_run_id, action_type, previous_values)
    values (old.id, old.run_id, 'deleted', to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

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
      status
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
      false,
      'draft'
    )
    returning id into incident_id;
  else
    incident_id := target.related_incident_id;
  end if;

  update public.scraper_records
  set related_incident_id = incident_id,
      status = 'imported',
      processed_at = now()
  where id = target_record_id;

  return incident_id;
end;
$$;

drop trigger if exists set_scraper_record_barangay on public.scraper_records;
create trigger set_scraper_record_barangay
before insert or update of latitude, longitude, barangay_id on public.scraper_records
for each row execute function public.set_scraper_record_barangay();

drop trigger if exists set_scraper_records_updated_at on public.scraper_records;
create trigger set_scraper_records_updated_at
before update on public.scraper_records
for each row execute function public.set_updated_at();

drop trigger if exists audit_scraper_records on public.scraper_records;
create trigger audit_scraper_records
after insert or update or delete on public.scraper_records
for each row execute function public.audit_scraper_record_change();

alter table public.scraper_sources enable row level security;
alter table public.scraper_runs enable row level security;
alter table public.scraper_records enable row level security;
alter table public.scraper_audit_logs enable row level security;

drop policy if exists admin_all_scraper_sources on public.scraper_sources;
drop policy if exists staff_read_scraper_sources on public.scraper_sources;
drop policy if exists admin_all_scraper_runs on public.scraper_runs;
drop policy if exists admin_dispatch_read_scraper_runs on public.scraper_runs;
drop policy if exists admin_all_scraper_records on public.scraper_records;
drop policy if exists admin_dispatch_read_scraper_records on public.scraper_records;
drop policy if exists anon_read_public_scraper_records on public.scraper_records;
drop policy if exists officer_read_scraper_records on public.scraper_records;
drop policy if exists dispatcher_update_scraper_records on public.scraper_records;
drop policy if exists admin_read_scraper_audit_logs on public.scraper_audit_logs;

create policy admin_all_scraper_sources on public.scraper_sources for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy staff_read_scraper_sources on public.scraper_sources for select to authenticated
using (auth.uid() is not null);

create policy admin_all_scraper_runs on public.scraper_runs for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_dispatch_read_scraper_runs on public.scraper_runs for select to authenticated
using (public.is_admin() or public.is_dispatcher());

create policy admin_all_scraper_records on public.scraper_records for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy anon_read_public_scraper_records on public.scraper_records for select to anon
using (public_visible and status in ('matched', 'imported') and deleted_at is null and latitude is not null and longitude is not null);
create policy officer_read_scraper_records on public.scraper_records for select to authenticated
using (public.is_admin() or public.is_dispatcher() or public.is_field_responder());
create policy dispatcher_update_scraper_records on public.scraper_records for update to authenticated
using (public.is_admin() or public.is_dispatcher()) with check (public.is_admin() or public.is_dispatcher());

create policy admin_read_scraper_audit_logs on public.scraper_audit_logs for select to authenticated
using (public.is_admin());

grant select on
  public.scraper_sources,
  public.scraper_runs,
  public.scraper_records,
  public.scraper_audit_logs
to authenticated;

grant usage on schema public to anon;
grant select on public.scraper_records to anon;

grant insert, update on
  public.scraper_sources,
  public.scraper_runs,
  public.scraper_records
to authenticated;

grant execute on function public.promote_scraper_record_to_incident(uuid) to authenticated;

commit;
