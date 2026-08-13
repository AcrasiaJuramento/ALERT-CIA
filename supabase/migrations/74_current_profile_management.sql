-- Self-service profile management for safe editable account fields.

begin;

create or replace function public.update_current_profile(
  p_display_name text,
  p_contact_number text,
  p_position_title text,
  p_agency text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  update public.profiles
  set display_name = nullif(trim(p_display_name), ''),
      contact_number = nullif(trim(p_contact_number), ''),
      position_title = nullif(trim(p_position_title), ''),
      agency = nullif(trim(p_agency), ''),
      updated_at = now()
  where id = auth.uid()
    and deleted_at is null
    and account_status = 'active'
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Active profile not found.';
  end if;

  return updated_profile;
end;
$$;

grant execute on function public.update_current_profile(text, text, text, text) to authenticated;

commit;
