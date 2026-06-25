-- Live ambulance availability status and dispatcher-managed registration.

begin;

alter table public.ambulance_units
  add column if not exists status text not null default 'available',
  add column if not exists responding_team_id uuid references public.responding_teams(id) on delete set null;

update public.ambulance_units
set status = case when active then 'available' else 'unavailable' end
where status is null
   or status not in ('available', 'busy', 'unavailable', 'maintenance');

alter table public.ambulance_units
  drop constraint if exists ambulance_units_status_check;

alter table public.ambulance_units
  add constraint ambulance_units_status_check
  check (status in ('available', 'busy', 'unavailable', 'maintenance'));

create or replace function public.sync_ambulance_unit_active()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.active is distinct from old.active then
    new.status := case when new.active then 'available' else 'unavailable' end;
  else
    new.status := coalesce(new.status, case when coalesce(new.active, true) then 'available' else 'unavailable' end);
    new.active := new.status = 'available';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_ambulance_unit_active on public.ambulance_units;
create trigger sync_ambulance_unit_active
before insert or update of status, active on public.ambulance_units
for each row execute function public.sync_ambulance_unit_active();

update public.ambulance_units
set active = status = 'available';

drop policy if exists dispatcher_insert_ambulance_units on public.ambulance_units;
drop policy if exists dispatcher_update_ambulance_units on public.ambulance_units;

create policy dispatcher_insert_ambulance_units on public.ambulance_units
for insert to authenticated
with check (public.is_dispatcher());

create policy dispatcher_update_ambulance_units on public.ambulance_units
for update to authenticated
using (public.is_dispatcher())
with check (public.is_dispatcher());

alter table public.ambulance_units replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_rel pr
       join pg_publication p on p.oid = pr.prpubid
       where p.pubname = 'supabase_realtime'
         and pr.prrelid = 'public.ambulance_units'::regclass
     ) then
    alter publication supabase_realtime add table public.ambulance_units;
  end if;
end $$;

revoke execute on function public.sync_ambulance_unit_active() from public, anon, authenticated;

commit;
