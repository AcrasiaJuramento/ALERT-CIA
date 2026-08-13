-- Keep public signup blocked while allowing Edge Function account provisioning.
-- The Edge Function inserts a short-lived provisioning request before calling
-- auth.admin.createUser. The auth trigger allows only matching, unconsumed
-- requests, then marks the request consumed.

begin;

create table if not exists public.admin_account_provisioning_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requested_role public.app_role not null,
  requested_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_account_provisioning_requests_active_email_idx
  on public.admin_account_provisioning_requests (lower(email))
  where consumed_at is null;

alter table public.admin_account_provisioning_requests enable row level security;

drop policy if exists admin_account_provisioning_requests_no_client_access
  on public.admin_account_provisioning_requests;

create policy admin_account_provisioning_requests_no_client_access
  on public.admin_account_provisioning_requests
  for all
  to authenticated
  using (false)
  with check (false);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provisioning_request record;
  requested_role public.app_role;
  display_name text;
begin
  select *
    into provisioning_request
  from public.admin_account_provisioning_requests
  where lower(email) = lower(new.email)
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if provisioning_request.id is null then
    raise exception 'Public account registration is disabled. Contact an administrator for access.';
  end if;

  requested_role := provisioning_request.requested_role;

  display_name := nullif(trim(coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'name',
    new.email
  )), '');

  insert into public.profiles (
    id,
    display_name,
    email,
    contact_number,
    position_title,
    agency,
    account_status
  )
  values (
    new.id,
    coalesce(display_name, 'Staff User'),
    new.email,
    nullif(new.raw_user_meta_data->>'contact_number', ''),
    nullif(new.raw_user_meta_data->>'position_title', ''),
    nullif(new.raw_user_meta_data->>'agency', ''),
    'active'
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      email = excluded.email,
      contact_number = excluded.contact_number,
      position_title = excluded.position_title,
      agency = excluded.agency,
      account_status = 'active',
      deleted_at = null,
      updated_at = now();

  insert into public.profile_roles (profile_id, role, assigned_by)
  values (new.id, requested_role, provisioning_request.requested_by)
  on conflict (profile_id, role) do nothing;

  update public.admin_account_provisioning_requests
  set consumed_at = now()
  where id = provisioning_request.id;

  return new;
end;
$$;

commit;
