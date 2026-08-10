begin;

create or replace function public.review_reverse_workflow_admin(target_pcr_id uuid, decision text, remarks text default null)
returns uuid language plpgsql security definer set search_path = public as $$
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

  if decision <> 'approve' then
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

grant execute on function public.review_reverse_workflow_admin(uuid, text, text) to authenticated;

update public.responses r
set status = 'pcr_in_progress', updated_at = now()
from public.pcr_reports p
where p.response_id = r.id
  and p.workflow_origin = 'reverse'
  and p.status = 'returned_for_correction';

insert into public.notifications(
  recipient_profile_id, recipient_team_id, type, title, message,
  response_id, dispatch_form_id, pcr_report_id
)
select
  coalesce(p.field_officer_id, p.created_by),
  coalesce(p.responding_team_id, r.responding_team_id),
  'system'::public.notification_type,
  'PCR returned for correction',
  coalesce(nullif(p.return_remarks, ''), 'Please correct the PCR and resubmit it for Admin verification.'),
  p.response_id, p.dispatch_form_id, p.id
from public.pcr_reports p
join public.responses r on r.id = p.response_id
where p.workflow_origin = 'reverse'
  and p.status = 'returned_for_correction'
  and not exists (
    select 1 from public.notifications n
    where n.pcr_report_id = p.id
      and n.title = 'PCR returned for correction'
  );

notify pgrst, 'reload schema';

commit;
