-- Field responder team assignment and dispatch/PCR linkage hardening.

begin;

with ranked_memberships as (
  select
    id,
    row_number() over (partition by profile_id order by joined_at desc, id desc) as active_rank
  from public.team_members
  where left_at is null
)
update public.team_members tm
set left_at = now()
from ranked_memberships ranked
where tm.id = ranked.id
  and ranked.active_rank > 1;

create unique index if not exists team_members_one_active_team_per_profile_idx
  on public.team_members(profile_id)
  where left_at is null;

alter table public.pcr_reports
  add column if not exists dispatch_form_id uuid references public.dispatch_forms(id) on delete set null,
  add column if not exists responding_team_id uuid references public.responding_teams(id) on delete set null,
  add column if not exists field_officer_id uuid references public.profiles(id) on delete set null;

update public.pcr_reports p
set dispatch_form_id = d.id,
    responding_team_id = r.responding_team_id,
    field_officer_id = coalesce(p.field_officer_id, p.created_by)
from public.responses r
left join public.dispatch_forms d on d.response_id = r.id
where p.response_id = r.id
  and (
    p.dispatch_form_id is distinct from d.id
    or p.responding_team_id is distinct from r.responding_team_id
    or p.field_officer_id is null
  );

create index if not exists pcr_reports_dispatch_form_idx on public.pcr_reports(dispatch_form_id);
create index if not exists pcr_reports_team_idx on public.pcr_reports(responding_team_id, updated_at desc);
create index if not exists pcr_reports_field_officer_idx on public.pcr_reports(field_officer_id, updated_at desc);

create or replace function public.accept_dispatch(target_response_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_team uuid;
  target_dispatch_form uuid;
  pcr_id uuid;
begin
  select responding_team_id into target_team
  from public.responses
  where id = target_response_id
    and deleted_at is null;

  if target_team is null then
    raise exception 'Dispatch has no responding team';
  end if;

  if not (public.is_admin() or target_team in (select public.user_team_ids())) then
    raise exception 'Not authorized to accept this dispatch';
  end if;

  select id into target_dispatch_form
  from public.dispatch_forms
  where response_id = target_response_id
    and deleted_at is null;

  update public.responses
  set status = 'accepted_by_responding_team',
      accepted_by_team_id = target_team,
      accepted_by_profile_id = auth.uid(),
      accepted_at = coalesce(accepted_at, now())
  where id = target_response_id;

  update public.dispatch_forms
  set status = 'accepted_by_responding_team',
      updated_by = auth.uid()
  where response_id = target_response_id;

  insert into public.pcr_reports(
    response_id,
    dispatch_form_id,
    responding_team_id,
    field_officer_id,
    status,
    created_by,
    updated_by
  )
  values (
    target_response_id,
    target_dispatch_form,
    target_team,
    auth.uid(),
    'in_progress',
    auth.uid(),
    auth.uid()
  )
  on conflict (response_id) do update
    set dispatch_form_id = coalesce(public.pcr_reports.dispatch_form_id, excluded.dispatch_form_id),
        responding_team_id = excluded.responding_team_id,
        field_officer_id = coalesce(public.pcr_reports.field_officer_id, excluded.field_officer_id),
        status = case when public.pcr_reports.status = 'draft' then 'in_progress' else public.pcr_reports.status end,
        updated_by = auth.uid(),
        updated_at = now()
  returning id into pcr_id;

  update public.responses set status = 'pcr_in_progress' where id = target_response_id;
  update public.dispatch_forms
  set status = 'pcr_in_progress',
      updated_by = auth.uid()
  where response_id = target_response_id;

  insert into public.notifications(recipient_team_id, type, title, message, response_id, pcr_report_id)
  values (target_team, 'pcr_created', 'PCR report ready', 'A PCR report has been opened from an accepted dispatch.', target_response_id, pcr_id);

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('accept', 'responses', target_response_id, target_response_id, jsonb_build_object(
    'pcr_report_id', pcr_id,
    'dispatch_form_id', target_dispatch_form,
    'responding_team_id', target_team,
    'field_officer_id', auth.uid()
  ));

  return pcr_id;
end;
$$;

drop policy if exists field_manage_team_pcr_reports on public.pcr_reports;
create policy field_manage_team_pcr_reports on public.pcr_reports for all to authenticated
using (
  responding_team_id in (select public.user_team_ids())
  or exists (
    select 1 from public.responses r
    where r.id = response_id and r.responding_team_id in (select public.user_team_ids())
  )
)
with check (
  responding_team_id in (select public.user_team_ids())
  or exists (
    select 1 from public.responses r
    where r.id = response_id and r.responding_team_id in (select public.user_team_ids())
  )
);

commit;
