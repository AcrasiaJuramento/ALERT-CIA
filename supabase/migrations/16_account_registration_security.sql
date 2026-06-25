-- Secure public officer registration.
-- Public signup may request only dispatcher or field_responder. Admin accounts stay manual/admin-only.

begin;

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
    account_status
  )
  values (
    new.id,
    coalesce(display_name, 'Pending Officer'),
    new.email,
    nullif(new.raw_user_meta_data->>'contact_number', ''),
    nullif(new.raw_user_meta_data->>'position_title', ''),
    'pending'
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      email = excluded.email,
      contact_number = excluded.contact_number,
      position_title = excluded.position_title,
      updated_at = now();

  insert into public.profile_roles (profile_id, role)
  values (new.id, requested_role)
  on conflict (profile_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

drop policy if exists profile_roles_self_read on public.profile_roles;
create policy profile_roles_self_read on public.profile_roles for select to authenticated
using (profile_id = auth.uid());

commit;
