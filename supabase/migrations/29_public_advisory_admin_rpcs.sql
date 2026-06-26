-- Admin-only helpers for creating, updating, and archiving public advisories.
-- This keeps the frontend from depending on direct table writes through RLS.

begin;

create or replace function public.save_public_advisory(
  target_id uuid default null,
  target_title text default 'Public Advisory',
  target_message text default '',
  target_severity text default 'warning',
  target_category text default 'general',
  target_area text default 'Echague, Isabela',
  target_latitude numeric default null,
  target_longitude numeric default null,
  target_status text default 'draft'
)
returns public.public_advisories
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.public_advisories;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not authorized to manage public advisories.';
  end if;

  if target_id is null then
    insert into public.public_advisories (
      title,
      message,
      severity,
      category,
      area,
      latitude,
      longitude,
      status,
      created_by,
      updated_by
    )
    values (
      coalesce(nullif(trim(target_title), ''), 'Public Advisory'),
      coalesce(nullif(trim(target_message), ''), 'No advisory message provided.'),
      target_severity,
      target_category,
      coalesce(nullif(trim(target_area), ''), 'Echague, Isabela'),
      target_latitude,
      target_longitude,
      target_status,
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
      category = target_category,
      area = coalesce(nullif(trim(target_area), ''), 'Echague, Isabela'),
      latitude = target_latitude,
      longitude = target_longitude,
      status = target_status,
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

create or replace function public.archive_public_advisory(target_id uuid)
returns public.public_advisories
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved public.public_advisories;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not authorized to manage public advisories.';
  end if;

  update public.public_advisories
  set
    deleted_at = now(),
    updated_by = auth.uid()
  where id = target_id
    and deleted_at is null
  returning * into saved;

  if saved.id is null then
    raise exception 'Public advisory not found.';
  end if;

  return saved;
end;
$$;

revoke all on function public.save_public_advisory(uuid, text, text, text, text, text, numeric, numeric, text) from public;
revoke all on function public.archive_public_advisory(uuid) from public;

grant execute on function public.save_public_advisory(uuid, text, text, text, text, text, numeric, numeric, text) to authenticated;
grant execute on function public.archive_public_advisory(uuid) to authenticated;

commit;
