begin;

drop policy if exists field_read_assigned_pcr_reports on public.pcr_reports;
create policy field_read_assigned_pcr_reports
on public.pcr_reports
for select
to authenticated
using (
  public.has_role('field_responder')
  and (
    field_officer_id = auth.uid()
    or created_by = auth.uid()
  )
);

notify pgrst, 'reload schema';

commit;
