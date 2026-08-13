-- Move account creation behind administrator-controlled provisioning.
-- Public auth signups are rejected at the database trigger. Admin-created
-- accounts must come through the admin-create-user Edge Function, which uses
-- service-role auth and marks auth.users app metadata server-side.

begin;

alter table public.profiles
  add column if not exists agency text;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.app_role;
  display_name text;
begin
  if coalesce(new.raw_app_meta_data->>'created_by', '') <> 'admin_user_management' then
    raise exception 'Public account registration is disabled. Contact an administrator for access.';
  end if;

  requested_role := case
    when new.raw_user_meta_data->>'role' in ('dispatcher', 'field_responder')
      then (new.raw_user_meta_data->>'role')::public.app_role
    else 'field_responder'::public.app_role
  end;

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

  insert into public.profile_roles (profile_id, role)
  values (new.id, requested_role)
  on conflict (profile_id, role) do nothing;

  return new;
end;
$$;

commit;
