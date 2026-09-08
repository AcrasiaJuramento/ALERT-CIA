begin;

create or replace function public.dispatcher_field_officer_contacts()
returns table (
  id uuid,
  display_name text,
  contact_number text,
  position_title text,
  team_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_dispatcher() then
    raise exception 'Dispatcher permission required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(trim(p.display_name), ''), p.email) as display_name,
    p.contact_number,
    coalesce(nullif(trim(p.position_title), ''), 'Field Officer') as position_title,
    team.name as team_name
  from public.profiles p
  join public.profile_roles pr
    on pr.profile_id = p.id
   and pr.role = 'field_responder'
  left join lateral (
    select rt.name
    from public.team_members tm
    join public.responding_teams rt on rt.id = tm.team_id
    where tm.profile_id = p.id
      and tm.left_at is null
      and rt.active
    order by tm.is_leader desc, tm.joined_at desc
    limit 1
  ) team on true
  where p.deleted_at is null
    and p.account_status = 'active'
  order by coalesce(nullif(trim(p.display_name), ''), p.email);
end;
$$;

revoke all on function public.dispatcher_field_officer_contacts() from public, anon;
grant execute on function public.dispatcher_field_officer_contacts() to authenticated;

notify pgrst, 'reload schema';

commit;
