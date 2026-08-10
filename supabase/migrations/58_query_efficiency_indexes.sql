-- Query efficiency indexes for paged list screens and delta-style sync checks.

begin;

create index if not exists incidents_status_date_active_idx
  on public.incidents(status, incident_date desc, updated_at desc)
  where deleted_at is null;

create index if not exists incidents_classification_date_active_idx
  on public.incidents(classification, incident_date desc, updated_at desc)
  where deleted_at is null;

create index if not exists incidents_updated_active_idx
  on public.incidents(updated_at desc)
  where deleted_at is null;

create index if not exists pcr_reports_workflow_status_updated_idx
  on public.pcr_reports(workflow_origin, status, updated_at desc)
  where deleted_at is null;

create index if not exists dispatch_forms_status_updated_active_idx
  on public.dispatch_forms(status, updated_at desc)
  where deleted_at is null;

create index if not exists notifications_profile_created_idx
  on public.notifications(recipient_profile_id, created_at desc);

commit;
