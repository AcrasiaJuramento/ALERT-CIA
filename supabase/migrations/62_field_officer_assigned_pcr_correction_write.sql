begin;

drop policy if exists field_update_assigned_pcr_reports on public.pcr_reports;
create policy field_update_assigned_pcr_reports
on public.pcr_reports
for update
to authenticated
using (
  public.has_role('field_responder')
  and (field_officer_id = auth.uid() or created_by = auth.uid())
  and status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
)
with check (
  public.has_role('field_responder')
  and (field_officer_id = auth.uid() or created_by = auth.uid())
  and status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
);

drop policy if exists field_manage_assigned_pcr_vital_signs on public.pcr_vital_signs;
create policy field_manage_assigned_pcr_vital_signs
on public.pcr_vital_signs
for all
to authenticated
using (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
)
with check (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
);

drop policy if exists field_manage_assigned_pcr_medications on public.pcr_medications;
create policy field_manage_assigned_pcr_medications
on public.pcr_medications
for all
to authenticated
using (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
)
with check (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
);

drop policy if exists field_manage_assigned_pcr_interventions on public.pcr_interventions;
create policy field_manage_assigned_pcr_interventions
on public.pcr_interventions
for all
to authenticated
using (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
)
with check (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
);

drop policy if exists field_manage_assigned_pcr_attachments on public.pcr_attachments;
create policy field_manage_assigned_pcr_attachments
on public.pcr_attachments
for all
to authenticated
using (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
)
with check (
  exists (
    select 1 from public.pcr_reports p
    where p.id = pcr_report_id
      and public.has_role('field_responder')
      and (p.field_officer_id = auth.uid() or p.created_by = auth.uid())
      and p.status in ('draft', 'in_progress', 'returned_to_field_officer', 'returned_for_correction', 'submitted')
  )
);

notify pgrst, 'reload schema';

commit;
