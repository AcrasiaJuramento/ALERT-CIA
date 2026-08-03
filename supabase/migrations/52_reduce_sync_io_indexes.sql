-- Reduce disk I/O for list pages, PCR preview loading, and repeated offline sync retries.
-- PostgreSQL does not automatically index every foreign key, so we add the
-- lookup paths used by ALERT-CIA's dispatch/PCR screens and sync RPCs.

begin;

create index if not exists dispatch_patients_dispatch_form_order_idx
  on public.dispatch_patients(dispatch_form_id, patient_order);

create index if not exists pcr_medications_report_idx
  on public.pcr_medications(pcr_report_id);

create index if not exists pcr_interventions_report_idx
  on public.pcr_interventions(pcr_report_id);

create index if not exists pcr_attachments_report_idx
  on public.pcr_attachments(pcr_report_id);

create index if not exists pcr_reports_created_active_idx
  on public.pcr_reports(created_at desc)
  where deleted_at is null;

create index if not exists dispatch_forms_created_active_idx
  on public.dispatch_forms(created_at desc)
  where deleted_at is null;

commit;
