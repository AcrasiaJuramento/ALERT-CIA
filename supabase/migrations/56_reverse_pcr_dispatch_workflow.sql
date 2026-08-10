-- Reverse PCR workflow: field-created PCR -> dispatcher review -> dispatch -> admin verification.

begin;

alter type public.pcr_status add value if not exists 'pending_dispatcher_review';
alter type public.pcr_status add value if not exists 'accepted_by_dispatcher';
alter type public.pcr_status add value if not exists 'linked_to_dispatch';
alter type public.pcr_status add value if not exists 'pending_admin_verification';
alter type public.pcr_status add value if not exists 'returned_to_field_officer';
alter type public.pcr_status add value if not exists 'returned_for_correction';
alter type public.dispatch_status add value if not exists 'pending_admin_verification';
alter type public.dispatch_status add value if not exists 'verified';
alter type public.dispatch_status add value if not exists 'returned_for_correction';

commit;
begin;

alter table public.pcr_reports
  add column if not exists workflow_origin text not null default 'normal',
  add column if not exists dispatcher_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists dispatcher_reviewed_at timestamptz,
  add column if not exists admin_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists admin_reviewed_at timestamptz,
  add column if not exists return_remarks text;

alter table public.dispatch_forms
  add column if not exists source_pcr_id uuid references public.pcr_reports(id) on delete restrict;

alter table public.pcr_reports drop constraint if exists pcr_reports_workflow_origin_check;
alter table public.pcr_reports add constraint pcr_reports_workflow_origin_check
  check (workflow_origin in ('normal', 'reverse'));

create unique index if not exists dispatch_forms_source_pcr_unique_idx
  on public.dispatch_forms(source_pcr_id) where source_pcr_id is not null and deleted_at is null;
create index if not exists pcr_reports_reverse_queue_idx
  on public.pcr_reports(workflow_origin, status, updated_at desc) where deleted_at is null;

create table if not exists public.pcr_dispatch_workflow_history (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  dispatch_form_id uuid references public.dispatch_forms(id) on delete set null,
  response_id uuid references public.responses(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  previous_status text,
  new_status text not null,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists pcr_dispatch_history_pcr_idx
  on public.pcr_dispatch_workflow_history(pcr_report_id, created_at desc);
alter table public.pcr_dispatch_workflow_history enable row level security;

drop policy if exists reverse_history_read on public.pcr_dispatch_workflow_history;
create policy reverse_history_read on public.pcr_dispatch_workflow_history for select to authenticated
using (
  public.is_admin() or public.is_dispatcher() or exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
  )
);

drop policy if exists dispatcher_read_reverse_pcr on public.pcr_reports;
create policy dispatcher_read_reverse_pcr on public.pcr_reports for select to authenticated
using (public.is_dispatcher() and workflow_origin = 'reverse');

drop policy if exists field_create_standalone_pcr on public.pcr_reports;
create policy field_create_standalone_pcr on public.pcr_reports for insert to authenticated
with check (workflow_origin = 'reverse' and (created_by = auth.uid() or field_officer_id = auth.uid()));

drop policy if exists field_read_own_standalone_pcr on public.pcr_reports;
create policy field_read_own_standalone_pcr on public.pcr_reports for select to authenticated
using (workflow_origin = 'reverse' and (created_by = auth.uid() or field_officer_id = auth.uid()));

drop policy if exists field_update_own_standalone_pcr on public.pcr_reports;
create policy field_update_own_standalone_pcr on public.pcr_reports for update to authenticated
using (
  workflow_origin = 'reverse'
  and (created_by = auth.uid() or field_officer_id = auth.uid())
  and status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction')
)
with check (workflow_origin = 'reverse' and (created_by = auth.uid() or field_officer_id = auth.uid()));

drop policy if exists reverse_pcr_vitals_access on public.pcr_vital_signs;
create policy reverse_pcr_vitals_access on public.pcr_vital_signs for all to authenticated
using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or public.is_dispatcher() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())))
with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())));
drop policy if exists reverse_pcr_medications_access on public.pcr_medications;
create policy reverse_pcr_medications_access on public.pcr_medications for all to authenticated
using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or public.is_dispatcher() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())))
with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())));
drop policy if exists reverse_pcr_interventions_access on public.pcr_interventions;
create policy reverse_pcr_interventions_access on public.pcr_interventions for all to authenticated
using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or public.is_dispatcher() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())))
with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())));
drop policy if exists reverse_pcr_attachments_access on public.pcr_attachments;
create policy reverse_pcr_attachments_access on public.pcr_attachments for all to authenticated
using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or public.is_dispatcher() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())))
with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and p.workflow_origin = 'reverse' and (public.is_admin() or p.created_by = auth.uid() or p.field_officer_id = auth.uid())));

create or replace function public.reverse_workflow_notify_role(
  target_role public.app_role,
  notification_title text,
  notification_message text,
  target_response_id uuid,
  target_dispatch_id uuid,
  target_pcr_id uuid
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications(recipient_profile_id, type, title, message, response_id, dispatch_form_id, pcr_report_id)
  select distinct pr.profile_id, 'system'::public.notification_type, notification_title, notification_message,
         target_response_id, target_dispatch_id, target_pcr_id
  from public.profile_roles pr
  join public.profiles p on p.id = pr.profile_id
  where pr.role = target_role and p.account_status = 'active';
$$;

create or replace function public.create_standalone_pcr(report_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  response_id uuid;
  report_id uuid;
begin
  if not exists (
    select 1 from public.profile_roles where profile_id = auth.uid() and role = 'field_responder'
  ) and not public.is_admin() then
    raise exception 'Only a field officer can create a standalone PCR';
  end if;

  insert into public.responses(
    date_of_incident, time_of_incident, place_of_incident, type_of_incident,
    patient_name, patient_age, patient_birthday, patient_sex, patient_address,
    initial_assessment, responding_team_id, status, accepted_by_profile_id, accepted_at
  ) values (
    nullif(report_payload->>'dateOfIncident', '')::date,
    nullif(report_payload->>'timeOfIncident', '')::time,
    nullif(report_payload->>'placeOfIncident', ''),
    nullif(report_payload->>'incidentType', ''),
    nullif(report_payload->>'patientName', ''),
    nullif(report_payload->>'age', '')::integer,
    nullif(report_payload->>'birthday', '')::date,
    nullif(report_payload->>'gender', ''),
    nullif(report_payload->>'address', ''),
    nullif(report_payload->>'chiefComplaint', ''),
    nullif(report_payload->>'respondingTeamId', '')::uuid,
    'pcr_in_progress', auth.uid(), now()
  ) returning id into response_id;

  insert into public.pcr_reports(
    response_id, dispatch_form_id, responding_team_id, field_officer_id,
    workflow_origin, status, notes, created_by, updated_by
  ) values (
    response_id, null, nullif(report_payload->>'respondingTeamId', '')::uuid, auth.uid(),
    'reverse', 'draft', nullif(report_payload->>'notes', ''), auth.uid(), auth.uid()
  ) returning id into report_id;

  insert into public.pcr_dispatch_workflow_history(
    pcr_report_id, response_id, action, new_status, remarks
  ) values (report_id, response_id, 'standalone_created', 'draft', 'Standalone/manual PCR created');

  return report_id;
end;
$$;

create or replace function public.submit_standalone_pcr(target_pcr_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  report public.pcr_reports%rowtype;
begin
  select * into report from public.pcr_reports where id = target_pcr_id and deleted_at is null for update;
  if report.id is null or report.workflow_origin <> 'reverse' then raise exception 'Standalone PCR not found'; end if;
  if report.created_by <> auth.uid() and report.field_officer_id <> auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  if report.status not in ('draft', 'in_progress', 'returned_to_field_officer') then raise exception 'PCR cannot be submitted from status %', report.status; end if;

  update public.pcr_reports set status = 'pending_dispatcher_review', submitted_at = now(),
    return_remarks = null, updated_by = auth.uid(), updated_at = now() where id = target_pcr_id;
  insert into public.pcr_dispatch_workflow_history(pcr_report_id, response_id, action, previous_status, new_status)
    values (target_pcr_id, report.response_id, case when report.status = 'returned_to_field_officer' then 'resubmitted' else 'submitted' end,
      report.status::text, 'pending_dispatcher_review');
  perform public.reverse_workflow_notify_role('dispatcher', 'Standalone PCR pending review',
    'A Field Officer submitted a standalone PCR for dispatcher review.', report.response_id, null, target_pcr_id);
  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
    values ('submit', 'pcr_reports', target_pcr_id, report.response_id, jsonb_build_object('status', 'pending_dispatcher_review', 'workflow_origin', 'reverse'));
  return target_pcr_id;
end;
$$;

create or replace function public.review_standalone_pcr(target_pcr_id uuid, decision text, remarks text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  report public.pcr_reports%rowtype;
  next_status public.pcr_status;
begin
  if not public.is_dispatcher() and not public.is_admin() then raise exception 'Dispatcher permission required'; end if;
  select * into report from public.pcr_reports where id = target_pcr_id and workflow_origin = 'reverse' and deleted_at is null for update;
  if report.id is null then raise exception 'Standalone PCR not found'; end if;
  if report.status <> 'pending_dispatcher_review' then raise exception 'PCR is not pending dispatcher review'; end if;
  if decision not in ('accept', 'return') then raise exception 'Decision must be accept or return'; end if;
  if decision = 'return' and nullif(trim(remarks), '') is null then raise exception 'Remarks are required when returning a PCR'; end if;
  next_status := case when decision = 'accept' then 'accepted_by_dispatcher'::public.pcr_status else 'returned_to_field_officer'::public.pcr_status end;

  update public.pcr_reports set status = next_status, dispatcher_reviewed_by = auth.uid(), dispatcher_reviewed_at = now(),
    return_remarks = case when decision = 'return' then remarks else null end, updated_by = auth.uid(), updated_at = now()
  where id = target_pcr_id;
  insert into public.pcr_dispatch_workflow_history(pcr_report_id, response_id, action, previous_status, new_status, remarks)
    values (target_pcr_id, report.response_id, case when decision = 'accept' then 'dispatcher_accepted' else 'returned_to_field_officer' end,
      report.status::text, next_status::text, remarks);
  insert into public.notifications(recipient_profile_id, type, title, message, response_id, pcr_report_id)
    values (coalesce(report.field_officer_id, report.created_by), 'system'::public.notification_type,
      case when decision = 'accept' then 'PCR accepted by dispatcher' else 'PCR returned for correction' end,
      case when decision = 'accept' then 'Your standalone PCR was accepted and is ready to be linked to a Dispatch Form.' else coalesce(remarks, 'Please correct and resubmit the PCR.') end,
      report.response_id, target_pcr_id);
  insert into public.audit_logs(action, table_name, record_id, response_id, previous_values, new_values)
    values (case when decision = 'accept' then 'accept'::public.audit_action else 'reject'::public.audit_action end,
      'pcr_reports', target_pcr_id, report.response_id, jsonb_build_object('status', report.status), jsonb_build_object('status', next_status, 'remarks', remarks));
  return target_pcr_id;
end;
$$;

create or replace function public.link_standalone_pcr_dispatch(target_pcr_id uuid, dispatch_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  report public.pcr_reports%rowtype;
  dispatch_id uuid;
begin
  if not public.is_dispatcher() and not public.is_admin() then raise exception 'Dispatcher permission required'; end if;
  select * into report from public.pcr_reports where id = target_pcr_id and workflow_origin = 'reverse' and deleted_at is null for update;
  if report.id is null then raise exception 'Standalone PCR not found'; end if;
  if report.status <> 'accepted_by_dispatcher' then raise exception 'PCR must be accepted before creating a Dispatch Form'; end if;
  if report.dispatch_form_id is not null or exists(select 1 from public.dispatch_forms where source_pcr_id = target_pcr_id and deleted_at is null) then
    raise exception 'A Dispatch Form already exists for this PCR';
  end if;

  update public.responses set
    date_of_incident = coalesce(nullif(dispatch_payload->>'dateOfIncident', '')::date, date_of_incident),
    time_of_incident = coalesce(nullif(dispatch_payload->>'timeOfIncident', '')::time, time_of_incident),
    place_of_incident = coalesce(nullif(dispatch_payload->>'placeOfIncident', ''), place_of_incident),
    type_of_incident = coalesce(nullif(dispatch_payload->>'typeOfIncident', ''), nullif(dispatch_payload->>'incidentNature', ''), type_of_incident),
    patient_name = coalesce(nullif(dispatch_payload->>'patientName', ''), patient_name),
    patient_age = coalesce(nullif(dispatch_payload->>'age', '')::integer, patient_age),
    patient_birthday = coalesce(nullif(dispatch_payload->>'birthday', '')::date, patient_birthday),
    patient_sex = coalesce(nullif(dispatch_payload->>'gender', ''), patient_sex),
    patient_address = coalesce(nullif(dispatch_payload->>'address', ''), patient_address),
    initial_assessment = coalesce(nullif(dispatch_payload->>'chiefComplaint', ''), initial_assessment),
    responding_team_id = coalesce(nullif(dispatch_payload->>'respondingTeamId', '')::uuid, responding_team_id),
    assigned_unit_id = coalesce(nullif(dispatch_payload->>'vehicleId', '')::uuid, assigned_unit_id),
    driver_name = coalesce(nullif(dispatch_payload->>'driver', ''), driver_name),
    main_aider_name = coalesce(nullif(dispatch_payload->>'mainAider', ''), main_aider_name),
    assistant_aider_name = coalesce(nullif(dispatch_payload->>'assistantAider', ''), assistant_aider_name),
    status = 'pcr_completed', updated_at = now()
  where id = report.response_id;

  insert into public.dispatch_forms(
    response_id, source_pcr_id, dispatch_time, arrival_scene_time, departure_scene_time,
    arrival_hospital_time, departure_hospital_time, arrival_office_time, hospital_name,
    number_of_patients, assistance_needed, notes, status, created_by, updated_by
  ) values (
    report.response_id, target_pcr_id, nullif(dispatch_payload->>'dispatchTime', '')::time,
    nullif(dispatch_payload->>'arrivalScene', '')::time, nullif(dispatch_payload->>'departureScene', '')::time,
    nullif(dispatch_payload->>'arrivalHospital', '')::time, nullif(dispatch_payload->>'departureHospital', '')::time,
    nullif(dispatch_payload->>'backToBase', '')::time, nullif(dispatch_payload->>'hospitalName', ''),
    greatest(1, coalesce(nullif(dispatch_payload->>'numberOfPatients', '')::integer, 1)),
    coalesce(array(select jsonb_array_elements_text(coalesce(dispatch_payload->'assistanceNeeded', '[]'::jsonb))), '{}'),
    nullif(dispatch_payload->>'notes', ''), 'pending_admin_verification', auth.uid(), auth.uid()
  ) returning id into dispatch_id;

  insert into public.dispatch_patients(dispatch_form_id, patient_order, patient_name, age, birthday, sex, address, assessment_findings)
  select dispatch_id, 1, r.patient_name, r.patient_age, r.patient_birthday, r.patient_sex, r.patient_address, r.initial_assessment
  from public.responses r where r.id = report.response_id;

  update public.pcr_reports set dispatch_form_id = dispatch_id, status = 'pending_admin_verification',
    responding_team_id = coalesce(nullif(dispatch_payload->>'respondingTeamId', '')::uuid, responding_team_id),
    return_remarks = null, updated_by = auth.uid(), updated_at = now() where id = target_pcr_id;
  insert into public.pcr_dispatch_workflow_history(pcr_report_id, dispatch_form_id, response_id, action, previous_status, new_status)
    values
      (target_pcr_id, dispatch_id, report.response_id, 'linked_to_dispatch', report.status::text, 'linked_to_dispatch'),
      (target_pcr_id, dispatch_id, report.response_id, 'submitted_for_admin_verification', 'linked_to_dispatch', 'pending_admin_verification');
  perform public.reverse_workflow_notify_role('administrator', 'PCR and Dispatch pending verification',
    'A reverse-workflow PCR has been linked to a Dispatch Form and requires final verification.', report.response_id, dispatch_id, target_pcr_id);
  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
    values ('create', 'dispatch_forms', dispatch_id, report.response_id, jsonb_build_object('source_pcr_id', target_pcr_id, 'status', 'pending_admin_verification'));
  return dispatch_id;
end;
$$;

create or replace function public.review_reverse_workflow_admin(target_pcr_id uuid, decision text, remarks text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  report public.pcr_reports%rowtype;
  next_status public.pcr_status;
begin
  if not public.is_admin() then raise exception 'Administrator permission required'; end if;
  select * into report from public.pcr_reports where id = target_pcr_id and workflow_origin = 'reverse' and deleted_at is null for update;
  if report.id is null or report.dispatch_form_id is null then raise exception 'Linked reverse-workflow PCR not found'; end if;
  if report.status not in ('pending_admin_verification', 'returned_for_correction') then raise exception 'PCR is not ready for admin review'; end if;
  if decision not in ('approve', 'return', 'reject') then raise exception 'Decision must be approve, return, or reject'; end if;
  if decision <> 'approve' and nullif(trim(remarks), '') is null then raise exception 'Remarks are required'; end if;
  next_status := case when decision = 'approve' then 'verified'::public.pcr_status when decision = 'reject' then 'rejected'::public.pcr_status else 'returned_for_correction'::public.pcr_status end;

  update public.pcr_reports set status = next_status, verified_by = case when decision = 'approve' then auth.uid() else verified_by end,
    verified_at = case when decision = 'approve' then now() else verified_at end,
    admin_reviewed_by = auth.uid(), admin_reviewed_at = now(), return_remarks = case when decision = 'approve' then null else remarks end,
    rejection_reason = case when decision = 'reject' then remarks else rejection_reason end, updated_by = auth.uid(), updated_at = now()
  where id = target_pcr_id;
  update public.dispatch_forms set status = case when decision = 'approve' then 'verified'::public.dispatch_status when decision = 'reject' then 'cancelled'::public.dispatch_status else 'returned_for_correction'::public.dispatch_status end,
    updated_by = auth.uid(), updated_at = now() where id = report.dispatch_form_id;
  insert into public.pcr_dispatch_workflow_history(pcr_report_id, dispatch_form_id, response_id, action, previous_status, new_status, remarks)
    values (target_pcr_id, report.dispatch_form_id, report.response_id,
      case when decision = 'approve' then 'admin_verified' else 'admin_returned' end, report.status::text, next_status::text, remarks);
  insert into public.notifications(recipient_profile_id, type, title, message, response_id, dispatch_form_id, pcr_report_id)
    values (coalesce(report.field_officer_id, report.created_by), 'system'::public.notification_type,
      case when decision = 'approve' then 'PCR and Dispatch verified' else 'Records returned for correction' end,
      case when decision = 'approve' then 'The connected PCR and Dispatch Form passed final verification.' else remarks end,
      report.response_id, report.dispatch_form_id, target_pcr_id);
  perform public.reverse_workflow_notify_role('dispatcher',
    case when decision = 'approve' then 'Reverse workflow verified' else 'Reverse workflow returned' end,
    case when decision = 'approve' then 'The connected PCR and Dispatch Form were verified.' else remarks end,
    report.response_id, report.dispatch_form_id, target_pcr_id);
  insert into public.audit_logs(action, table_name, record_id, response_id, previous_values, new_values)
    values (case when decision = 'approve' then 'verify'::public.audit_action else 'reject'::public.audit_action end,
      'pcr_reports', target_pcr_id, report.response_id, jsonb_build_object('status', report.status), jsonb_build_object('status', next_status, 'remarks', remarks));
  return target_pcr_id;
end;
$$;

create or replace function public.resubmit_reverse_workflow_admin(target_pcr_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare report public.pcr_reports%rowtype;
begin
  select * into report from public.pcr_reports where id = target_pcr_id and workflow_origin = 'reverse' and deleted_at is null for update;
  if report.id is null or report.status <> 'returned_for_correction' then raise exception 'PCR is not awaiting correction'; end if;
  if report.created_by <> auth.uid() and report.field_officer_id <> auth.uid() and not public.is_dispatcher() then raise exception 'Not authorized'; end if;
  update public.pcr_reports set status = 'pending_admin_verification', return_remarks = null, updated_by = auth.uid(), updated_at = now() where id = target_pcr_id;
  update public.dispatch_forms set status = 'pending_admin_verification', updated_by = auth.uid(), updated_at = now() where id = report.dispatch_form_id;
  insert into public.pcr_dispatch_workflow_history(pcr_report_id, dispatch_form_id, response_id, action, previous_status, new_status)
    values (target_pcr_id, report.dispatch_form_id, report.response_id, 'resubmitted_for_admin', report.status::text, 'pending_admin_verification');
  perform public.reverse_workflow_notify_role('administrator', 'Corrected records resubmitted',
    'A corrected PCR and Dispatch Form require final verification.', report.response_id, report.dispatch_form_id, target_pcr_id);
  return target_pcr_id;
end;
$$;

grant select on public.pcr_dispatch_workflow_history to authenticated;
grant execute on function public.create_standalone_pcr(jsonb) to authenticated;
grant execute on function public.submit_standalone_pcr(uuid) to authenticated;
grant execute on function public.review_standalone_pcr(uuid, text, text) to authenticated;
grant execute on function public.link_standalone_pcr_dispatch(uuid, jsonb) to authenticated;
grant execute on function public.review_reverse_workflow_admin(uuid, text, text) to authenticated;
grant execute on function public.resubmit_reverse_workflow_admin(uuid) to authenticated;

commit;
