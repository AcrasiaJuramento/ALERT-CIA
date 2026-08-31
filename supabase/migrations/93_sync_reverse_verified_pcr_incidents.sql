-- Keep standalone/reverse PCR admin verification in sync with map-facing incidents.
-- Before this migration, reverse PCR approval could mark the PCR, dispatch, and
-- response as verified while leaving the generated incident at
-- pending_admin_verification. Accident-prone scoring reads incidents.status, so
-- those verified standalone records were skipped.

begin;

create or replace function public.sync_response_incident_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in (
    'sent_to_responding_team',
    'accepted_by_responding_team',
    'pcr_in_progress',
    'pcr_completed',
    'verified'
  ) then
    perform public.sync_response_to_incident(new.id, new.status in ('pcr_completed', 'verified'));
  end if;

  return new;
end;
$$;

drop trigger if exists sync_response_to_incident_on_status on public.responses;
create trigger sync_response_to_incident_on_status
after insert or update of status, date_of_incident, time_of_incident, place_of_incident, barangay_id, type_of_incident, initial_assessment
on public.responses
for each row
when (new.status in (
  'sent_to_responding_team',
  'accepted_by_responding_team',
  'pcr_in_progress',
  'pcr_completed',
  'verified'
))
execute function public.sync_response_incident_trigger();

create or replace function public.review_reverse_workflow_admin(target_pcr_id uuid, decision text, remarks text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  report public.pcr_reports%rowtype;
  next_status public.pcr_status;
  target_profile uuid;
  target_team uuid;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  select * into report from public.pcr_reports where id = target_pcr_id and workflow_origin = 'reverse' and deleted_at is null for update;
  if report.id is null or report.dispatch_form_id is null then raise exception 'Linked reverse-workflow PCR not found'; end if;
  if report.status not in ('pending_admin_verification', 'returned_for_correction') then raise exception 'PCR is not ready for admin review'; end if;
  if decision not in ('approve', 'return', 'reject') then raise exception 'Decision must be approve, return, or reject'; end if;
  if decision <> 'approve' and nullif(trim(remarks), '') is null then raise exception 'Remarks are required'; end if;

  target_profile := coalesce(report.field_officer_id, report.created_by);
  select coalesce(report.responding_team_id, r.responding_team_id) into target_team
  from public.responses r where r.id = report.response_id;
  next_status := case when decision = 'approve' then 'verified'::public.pcr_status else 'returned_for_correction'::public.pcr_status end;

  update public.pcr_reports set status = next_status,
    verified_by = case when decision = 'approve' then auth.uid() else verified_by end,
    verified_at = case when decision = 'approve' then now() else verified_at end,
    admin_reviewed_by = auth.uid(), admin_reviewed_at = now(),
    return_remarks = case when decision = 'approve' then null else remarks end,
    rejection_reason = case when decision = 'approve' then null else remarks end,
    updated_by = auth.uid(), updated_at = now()
  where id = target_pcr_id;

  update public.dispatch_forms set
    status = case when decision = 'approve' then 'verified'::public.dispatch_status else 'returned_for_correction'::public.dispatch_status end,
    updated_by = auth.uid(), updated_at = now()
  where id = report.dispatch_form_id;

  if decision = 'approve' then
    update public.responses
    set status = case
          when status = 'pcr_completed' then status
          else 'verified'::public.dispatch_status
        end,
        resolved_at = coalesce(resolved_at, now()),
        updated_at = now()
    where id = report.response_id
      and (status not in ('verified', 'pcr_completed') or resolved_at is null);

    perform public.sync_response_to_incident(report.response_id, true);
  else
    update public.responses set status = 'pcr_in_progress', updated_at = now() where id = report.response_id;
  end if;

  insert into public.pcr_dispatch_workflow_history(pcr_report_id, dispatch_form_id, response_id, action, previous_status, new_status, remarks)
  values (target_pcr_id, report.dispatch_form_id, report.response_id,
    case when decision = 'approve' then 'admin_verified' else 'admin_returned_to_field_officer' end,
    report.status::text, next_status::text, remarks);

  insert into public.notifications(recipient_profile_id, recipient_team_id, type, title, message, response_id, dispatch_form_id, pcr_report_id)
  values (target_profile, target_team, 'system'::public.notification_type,
    case when decision = 'approve' then 'PCR and Dispatch verified' else 'PCR returned for correction' end,
    case when decision = 'approve' then 'The connected PCR and Dispatch Form passed final verification.' else remarks end,
    report.response_id, report.dispatch_form_id, target_pcr_id);

  perform public.reverse_workflow_notify_role('dispatcher',
    case when decision = 'approve' then 'Reverse workflow verified' else 'PCR returned to Field Officer' end,
    case when decision = 'approve' then 'The connected PCR and Dispatch Form were verified.' else remarks end,
    report.response_id, report.dispatch_form_id, target_pcr_id);

  insert into public.audit_logs(action, table_name, record_id, response_id, previous_values, new_values)
  values (case when decision = 'approve' then 'verify'::public.audit_action else 'reject'::public.audit_action end,
    'pcr_reports', target_pcr_id, report.response_id,
    jsonb_build_object('status', report.status),
    jsonb_build_object('status', next_status, 'remarks', remarks, 'returned_to', target_profile, 'responding_team_id', target_team));

  return target_pcr_id;
end;
$$;

drop function if exists public.public_pcr_map_incidents(integer);
create function public.public_pcr_map_incidents(max_rows integer default 100)
returns table (
  pcr_id uuid, incident_id uuid, response_id uuid, classification text,
  priority text, triage text, location_text text, barangay text,
  latitude numeric, longitude numeric, incident_date date,
  incident_time time, incident_status text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with canonical_pcr as (
    select distinct on (p.response_id) p.*
    from public.pcr_reports p
    where p.deleted_at is null
      and p.response_id is not null
      and p.status = 'verified'
    order by p.response_id, p.updated_at desc nulls last
  )
  select
    p.id, i.id, p.response_id,
    coalesce(i.classification::text, public.classify_response_incident(coalesce(p.incident_nature, r.type_of_incident))::text),
    coalesce(i.priority::text, public.priority_from_pcr_triage(p.triage)::text, 'medium'),
    p.triage, coalesce(i.location_text, r.location_text, r.place_of_incident, b.name), b.name,
    coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)),
    coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)),
    coalesce(i.incident_date, r.date_of_incident, p.verified_at::date, p.submitted_at::date, p.created_at::date),
    coalesce(i.incident_time, r.time_of_incident),
    coalesce(
      case when i.status::text = 'pending_admin_verification' then null else i.status::text end,
      case when r.status::text = 'pending_admin_verification' then null else r.status::text end,
      'verified'
    )
  from canonical_pcr p
  left join public.responses r on r.id = p.response_id and r.deleted_at is null
  left join public.incidents i on i.response_id = p.response_id and i.deleted_at is null
  left join public.barangays b on b.id = coalesce(i.barangay_id, r.barangay_id)
  where coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)) is not null
    and coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)) is not null
  order by coalesce(i.incident_date, r.date_of_incident, p.verified_at::date, p.submitted_at::date, p.created_at::date) desc
  limit greatest(1, least(coalesce(max_rows, 100), 500));
$$;

grant execute on function public.review_reverse_workflow_admin(uuid, text, text) to authenticated;
grant execute on function public.public_pcr_map_incidents(integer) to anon, authenticated;

do $$
declare
  verified_response_id uuid;
begin
  for verified_response_id in
    select distinct p.response_id
    from public.pcr_reports p
    where p.workflow_origin = 'reverse'
      and p.status = 'verified'
      and p.response_id is not null
      and p.deleted_at is null
  loop
    update public.responses
    set status = case
          when status = 'pcr_completed' then status
          else 'verified'::public.dispatch_status
        end,
        resolved_at = coalesce(resolved_at, now()),
        updated_at = now()
    where id = verified_response_id
      and deleted_at is null
      and (status not in ('verified', 'pcr_completed') or resolved_at is null);

    perform public.sync_response_to_incident(verified_response_id, true);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
