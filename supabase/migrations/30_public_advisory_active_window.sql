-- Adds active windows and database aliases used by the public advisory workflow.

begin;

alter table public.public_advisories
  add column if not exists advisory_type text,
  add column if not exists priority text,
  add column if not exists starts_at timestamptz default now(),
  add column if not exists expires_at timestamptz;

update public.public_advisories
set
  advisory_type = coalesce(advisory_type, category, 'general'),
  priority = coalesce(priority, severity, 'warning'),
  starts_at = coalesce(starts_at, created_at, now())
where advisory_type is null
  or priority is null
  or starts_at is null;

alter table public.public_advisories
  alter column advisory_type set default 'general',
  alter column priority set default 'warning';

do $$
begin
  alter table public.public_advisories
    add constraint public_advisories_advisory_type_check
    check (advisory_type in ('flood', 'road_closure', 'weather', 'general'));
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.public_advisories
    add constraint public_advisories_priority_check
    check (priority in ('critical', 'warning', 'moderate', 'resolved'));
exception
  when duplicate_object then null;
end;
$$;

drop policy if exists public_read_published_advisories on public.public_advisories;
create policy public_read_published_advisories on public.public_advisories
for select to anon, authenticated
using (
  status = 'published'
  and deleted_at is null
  and coalesce(starts_at, created_at, now()) <= now()
  and (expires_at is null or expires_at > now())
);

create or replace function public.save_public_advisory(
  target_id uuid default null,
  target_title text default 'Public Advisory',
  target_message text default '',
  target_severity text default 'warning',
  target_category text default 'general',
  target_area text default 'Echague, Isabela',
  target_latitude numeric default null,
  target_longitude numeric default null,
  target_status text default 'draft',
  target_starts_at timestamptz default now(),
  target_expires_at timestamptz default null
)
returns public.public_advisories
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.public_advisories;
  safe_starts_at timestamptz := coalesce(target_starts_at, now());
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not authorized to manage public advisories.';
  end if;

  if target_expires_at is not null and target_expires_at <= safe_starts_at then
    raise exception 'Advisory end date must be later than the start date.';
  end if;

  if target_id is null then
    insert into public.public_advisories (
      title,
      message,
      severity,
      priority,
      category,
      advisory_type,
      area,
      latitude,
      longitude,
      status,
      starts_at,
      expires_at,
      created_by,
      updated_by
    )
    values (
      coalesce(nullif(trim(target_title), ''), 'Public Advisory'),
      coalesce(nullif(trim(target_message), ''), 'No advisory message provided.'),
      target_severity,
      target_severity,
      target_category,
      target_category,
      coalesce(nullif(trim(target_area), ''), 'Echague, Isabela'),
      target_latitude,
      target_longitude,
      target_status,
      safe_starts_at,
      target_expires_at,
      auth.uid(),
      auth.uid()
    )
    returning * into saved;
  else
    update public.public_advisories
    set
      title = coalesce(nullif(trim(target_title), ''), 'Public Advisory'),
      message = coalesce(nullif(trim(target_message), ''), 'No advisory message provided.'),
      severity = target_severity,
      priority = target_severity,
      category = target_category,
      advisory_type = target_category,
      area = coalesce(nullif(trim(target_area), ''), 'Echague, Isabela'),
      latitude = target_latitude,
      longitude = target_longitude,
      status = target_status,
      starts_at = safe_starts_at,
      expires_at = target_expires_at,
      updated_by = auth.uid(),
      deleted_at = null
    where id = target_id
      and deleted_at is null
    returning * into saved;

    if saved.id is null then
      raise exception 'Public advisory not found.';
    end if;
  end if;

  return saved;
end;
$$;

revoke all on function public.save_public_advisory(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz) from public;
grant execute on function public.save_public_advisory(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.public_advisories;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

commit;
