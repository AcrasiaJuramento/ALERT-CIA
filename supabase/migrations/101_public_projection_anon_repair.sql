-- Repair anonymous reads for public-safe map projections.
--
-- Public screens read these views with the publishable/anon key. The views are
-- intentionally owner-evaluated projections over private incident/PCR tables:
-- callers receive only the listed public columns, not base table rows.

begin;

alter view public.public_map_incidents_view
  set (security_barrier = true, security_invoker = false);

alter view public.public_pcr_map_incidents_view
  set (security_barrier = true, security_invoker = false);

alter view public.public_scraped_map_incidents_view
  set (security_barrier = true, security_invoker = false);

grant select
on
  public.public_map_incidents_view,
  public.public_pcr_map_incidents_view,
  public.public_scraped_map_incidents_view
to anon, authenticated;

-- These helpers only map public-safe text values to broad categories/severity.
-- The projection views need anon EXECUTE to evaluate them, but the sensitive
-- response/PCR tables remain unreachable directly.
grant execute on function public.classify_response_incident(text) to anon, authenticated;
grant execute on function public.priority_from_pcr_triage(text) to anon, authenticated;

revoke select
on
  public.incidents,
  public.scraper_records,
  public.pcr_reports,
  public.responses,
  public.dispatch_forms,
  public.dispatch_patients
from anon;

notify pgrst, 'reload schema';

commit;
