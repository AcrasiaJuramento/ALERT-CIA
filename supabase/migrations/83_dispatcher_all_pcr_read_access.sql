-- Administrators already have organization-wide PCR access. Give Dispatchers
-- the same read visibility while preserving the existing workflow write rules.
drop policy if exists dispatcher_read_all_pcr_reports on public.pcr_reports;
create policy dispatcher_read_all_pcr_reports
on public.pcr_reports
for select
to authenticated
using (public.is_dispatcher());

notify pgrst, 'reload schema';
