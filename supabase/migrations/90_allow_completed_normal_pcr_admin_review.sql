create or replace function public.review_normal_pcr_admin(
  target_pcr_id uuid,
  decision text,
  remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  report public.pcr_reports%rowtype;
  target_profile uuid;
  target_team uuid;
  next_status public.pcr_status;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required';
  end if;

  if decision not in ('approve', 'return', 'reject') then
    raise exception 'Decision must be approve, return, or reject';
  end if;

  if decision in ('return', 'reject') and nullif(trim(coalesce(remarks, '')), '') is null then
    raise exception 'Remarks are required';
  end if;

  select *
  into report
  from public.pcr_reports
  where id = target_pcr_id
    and coalesce(workflow_origin, 'normal') = 'normal'
    and deleted_at is null
  for update;

  if report.id is null then
    raise exception 'Normal-workflow PCR not found';
  end if;

  if report.status not in ('submitted', 'completed', 'rejected', 'returned_for_correction') then
    raise exception 'PCR is not ready for Admin review';
  end if;

  select coalesce(report.responding_team_id, r.responding_team_id)
  into target_team
  from public.responses r
  where r.id = report.response_id;

  target_profile := coalesce(report.field_officer_id, report.created_by);
  next_status := case
    when decision = 'approve' then 'verified'::public.pcr_status
    else 'returned_for_correction'::public.pcr_status
  end;

  update public.pcr_reports
  set status = next_status,
      verified_by = case when decision = 'approve' then auth.uid() else verified_by end,
      verified_at = case when decision = 'approve' then now() else verified_at end,
      rejection_reason = case when decision = 'approve' then null else remarks end,
      return_remarks = case when decision = 'approve' then null else remarks end,
      admin_reviewed_by = auth.uid(),
      admin_reviewed_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_pcr_id;

  if decision in ('return', 'reject') then
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
  end if;

  insert into public.audit_logs(
    action, table_name, record_id, response_id, previous_values, new_values
  )
  values (
    case when decision = 'approve' then 'verify'::public.audit_action else 'reject'::public.audit_action end,
    'pcr_reports',
    target_pcr_id,
    report.response_id,
    jsonb_build_object('status', report.status),
    jsonb_build_object(
      'status', next_status,
      'remarks', remarks,
      'returned_to', case when decision = 'approve' then null else target_profile end,
      'responding_team_id', target_team
    )
  );

  return target_pcr_id;
end;
$$;

create or replace function public.return_normal_pcr_to_field_officer(
  target_pcr_id uuid,
  remarks text
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.review_normal_pcr_admin(target_pcr_id, 'return', remarks);
$$;

grant execute on function public.review_normal_pcr_admin(uuid, text, text) to authenticated;
grant execute on function public.return_normal_pcr_to_field_officer(uuid, text) to authenticated;

notify pgrst, 'reload schema';
