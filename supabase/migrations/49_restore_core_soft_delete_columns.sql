-- Restore expected soft-delete columns on core response/dispatch/PCR tables.
-- Some ALERT-CIA deployments were created before these audit fields existed;
-- later sync RPCs and list queries expect them to be present.

begin;

alter table if exists public.responses
  add column if not exists deleted_at timestamptz;

alter table if exists public.dispatch_forms
  add column if not exists deleted_at timestamptz;

alter table if exists public.dispatch_patients
  add column if not exists deleted_at timestamptz;

alter table if exists public.pcr_reports
  add column if not exists deleted_at timestamptz;

create index if not exists responses_not_deleted_idx
  on public.responses(updated_at desc)
  where deleted_at is null;

create index if not exists dispatch_forms_not_deleted_idx
  on public.dispatch_forms(updated_at desc)
  where deleted_at is null;

create index if not exists pcr_reports_not_deleted_idx
  on public.pcr_reports(updated_at desc)
  where deleted_at is null;

commit;

