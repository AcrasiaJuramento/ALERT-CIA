begin;

create or replace function public.return_normal_pcr_to_field_officer(
  target_pcr_id uuid,
  remarks text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.pcr_reports%rowtype;
  target_profile uuid;
  target_team uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;
  if nullif(trim(remarks), '') is null then
    raise exception 'Remarks are required';
  end if;

  select *
  into report
  from public.pcr_reports
  where id = target_pcr_id
    and workflow_origin = 'normal'
    and deleted_at is null
  for update;

  if report.id is null then
    raise exception 'Normal-workflow PCR not found';
  end if;
  if report.status not in ('submitted', 'rejected', 'returned_for_correction') then
    raise exception 'PCR is not ready for Admin return';
  end if;

  target_profile := coalesce(report.field_officer_id, report.created_by);
  select coalesce(report.responding_team_id, r.responding_team_id)
  into target_team
  from public.responses r
  where r.id = report.response_id;

  update public.pcr_reports
  set status = 'returned_for_correction',
      rejection_reason = remarks,
      return_remarks = remarks,
      admin_reviewed_by = auth.uid(),
      admin_reviewed_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_pcr_id;

  update public.dispatch_forms
  set status = 'returned_for_correction',
      updated_by = auth.uid(),
      updated_at = now()
  where id = report.dispatch_form_id;

  update public.responses
  set status = 'pcr_in_progress',
      updated_at = now()
  where id = report.response_id;

  insert into public.notifications(
    recipient_profile_id, recipient_team_id, type, title, message,
    response_id, dispatch_form_id, pcr_report_id
  )
  values (
    target_profile, target_team, 'system'::public.notification_type,
    'PCR returned for correction', remarks,
    report.response_id, report.dispatch_form_id, target_pcr_id
  );

  insert into public.audit_logs(
    action, table_name, record_id, response_id, previous_values, new_values
  )
  values (
    'reject'::public.audit_action, 'pcr_reports', target_pcr_id, report.response_id,
    jsonb_build_object('status', report.status),
    jsonb_build_object(
      'status', 'returned_for_correction',
      'remarks', remarks,
      'returned_to', target_profile,
      'responding_team_id', target_team
    )
  );

  return target_pcr_id;
end;
$$;

grant execute on function public.return_normal_pcr_to_field_officer(uuid, text) to authenticated;

-- Repair normal PCRs rejected by the old terminal-status workflow.
update public.pcr_reports p
set status = 'returned_for_correction',
    return_remarks = coalesce(nullif(p.return_remarks, ''), nullif(p.rejection_reason, ''), 'Please correct the PCR and resubmit it.'),
    updated_at = now()
where p.workflow_origin = 'normal'
  and p.status = 'rejected'
  and p.deleted_at is null;

update public.dispatch_forms d
set status = 'returned_for_correction',
    updated_at = now()
from public.pcr_reports p
where p.dispatch_form_id = d.id
  and p.workflow_origin = 'normal'
  and p.status = 'returned_for_correction'
  and p.rejection_reason is not null;

update public.responses r
set status = 'pcr_in_progress',
    updated_at = now()
from public.pcr_reports p
where p.response_id = r.id
  and p.workflow_origin = 'normal'
  and p.status = 'returned_for_correction'
  and p.rejection_reason is not null;

insert into public.notifications(
  recipient_profile_id, recipient_team_id, type, title, message,
  response_id, dispatch_form_id, pcr_report_id
)
select
  coalesce(p.field_officer_id, p.created_by),
  coalesce(p.responding_team_id, r.responding_team_id),
  'system'::public.notification_type,
  'PCR returned for correction',
  coalesce(nullif(p.return_remarks, ''), nullif(p.rejection_reason, ''), 'Please correct the PCR and resubmit it.'),
  p.response_id, p.dispatch_form_id, p.id
from public.pcr_reports p
join public.responses r on r.id = p.response_id
where p.workflow_origin = 'normal'
  and p.status = 'returned_for_correction'
  and p.rejection_reason is not null
  and not exists (
    select 1
    from public.notifications n
    where n.pcr_report_id = p.id
      and n.title = 'PCR returned for correction'
  );

notify pgrst, 'reload schema';

commit;
