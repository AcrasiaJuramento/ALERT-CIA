-- Row Level Security policies.
-- Admins have full access. Dispatchers manage dispatch records.
-- Field responders access only dispatches/PCRs assigned to their teams.

begin;

alter table public.organizations enable row level security;
alter table public.stations enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.barangays enable row level security;
alter table public.gis_import_batches enable row level security;
alter table public.responding_teams enable row level security;
alter table public.team_members enable row level security;
alter table public.ambulance_units enable row level security;
alter table public.responses enable row level security;
alter table public.dispatch_forms enable row level security;
alter table public.dispatch_patients enable row level security;
alter table public.pcr_reports enable row level security;
alter table public.pcr_vital_signs enable row level security;
alter table public.pcr_medications enable row level security;
alter table public.pcr_interventions enable row level security;
alter table public.pcr_attachments enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_media enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.audit_logs enable row level security;
alter table public.data_exports enable row level security;

create policy profiles_self_or_admin_read on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy admin_all_organizations on public.organizations for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_all_stations on public.stations for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_all_profile_roles on public.profile_roles for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_all_barangays on public.barangays for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_all_gis_import_batches on public.gis_import_batches for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_all_responding_teams on public.responding_teams for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_all_team_members on public.team_members for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy admin_all_ambulance_units on public.ambulance_units for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy lookup_staff_read on public.barangays for select to authenticated using (true);
create policy stations_staff_read on public.stations for select to authenticated using (auth.uid() is not null);
create policy teams_staff_read on public.responding_teams for select to authenticated using (auth.uid() is not null);
create policy vehicles_staff_read on public.ambulance_units for select to authenticated using (auth.uid() is not null);
create policy team_members_staff_read on public.team_members for select to authenticated using (auth.uid() is not null);

create policy admin_all_responses on public.responses for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy dispatcher_manage_responses on public.responses for all to authenticated
using (public.is_dispatcher()) with check (public.is_dispatcher());
create policy field_read_assigned_responses on public.responses for select to authenticated
using (responding_team_id in (select public.user_team_ids()));
create policy field_update_assigned_responses on public.responses for update to authenticated
using (responding_team_id in (select public.user_team_ids()))
with check (responding_team_id in (select public.user_team_ids()));

create policy admin_all_dispatch_forms on public.dispatch_forms for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy dispatcher_manage_dispatch_forms on public.dispatch_forms for all to authenticated
using (public.is_dispatcher()) with check (public.is_dispatcher());
create policy field_read_assigned_dispatch_forms on public.dispatch_forms for select to authenticated
using (exists (
  select 1 from public.responses r
  where r.id = response_id and r.responding_team_id in (select public.user_team_ids())
));

create policy dispatch_patients_read_via_dispatch on public.dispatch_patients for select to authenticated
using (exists (
  select 1 from public.dispatch_forms d
  join public.responses r on r.id = d.response_id
  where d.id = dispatch_form_id
    and (public.is_admin() or public.is_dispatcher() or r.responding_team_id in (select public.user_team_ids()))
));
create policy dispatch_patients_dispatcher_write on public.dispatch_patients for all to authenticated
using (public.is_admin() or public.is_dispatcher())
with check (public.is_admin() or public.is_dispatcher());

create policy admin_all_pcr_reports on public.pcr_reports for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy field_manage_team_pcr_reports on public.pcr_reports for all to authenticated
using (exists (
  select 1 from public.responses r
  where r.id = response_id and r.responding_team_id in (select public.user_team_ids())
))
with check (exists (
  select 1 from public.responses r
  where r.id = response_id and r.responding_team_id in (select public.user_team_ids())
));

create policy pcr_child_access on public.pcr_vital_signs for all to authenticated
using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids())))))
with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids())))));
create policy pcr_medications_access on public.pcr_medications for all to authenticated using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids()))))) with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids())))));
create policy pcr_interventions_access on public.pcr_interventions for all to authenticated using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids()))))) with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids())))));
create policy pcr_attachments_access on public.pcr_attachments for all to authenticated using (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids()))))) with check (exists (select 1 from public.pcr_reports p where p.id = pcr_report_id and (public.is_admin() or exists (select 1 from public.responses r where r.id = p.response_id and r.responding_team_id in (select public.user_team_ids())))));

create policy incidents_staff_read on public.incidents for select to authenticated
using (public.is_admin() or public.is_dispatcher() or exists (
  select 1 from public.responses r where r.id = response_id and r.responding_team_id in (select public.user_team_ids())
));
create policy incidents_admin_dispatch_write on public.incidents for all to authenticated
using (public.is_admin() or public.is_dispatcher()) with check (public.is_admin() or public.is_dispatcher());

create policy incident_media_staff_read on public.incident_media for select to authenticated
using (exists (
  select 1 from public.incidents i
  left join public.responses r on r.id = i.response_id
  where i.id = incident_id
    and (public.is_admin() or public.is_dispatcher() or r.responding_team_id in (select public.user_team_ids()))
));
create policy incident_media_admin_dispatch_write on public.incident_media for all to authenticated
using (public.is_admin() or public.is_dispatcher()) with check (public.is_admin() or public.is_dispatcher());

create policy admin_all_notifications on public.notifications for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy notifications_recipient_read on public.notifications for select to authenticated
using (recipient_profile_id = auth.uid() or recipient_team_id in (select public.user_team_ids()) or public.is_admin());
create policy notifications_recipient_update on public.notifications for update to authenticated
using (recipient_profile_id = auth.uid() or recipient_team_id in (select public.user_team_ids()))
with check (recipient_profile_id = auth.uid() or recipient_team_id in (select public.user_team_ids()));

create policy notification_preferences_self_or_admin on public.notification_preferences for all to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());
create policy exports_admin_read on public.data_exports for select to authenticated using (public.is_admin());
create policy exports_admin_write on public.data_exports for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to authenticated;
grant select on
  public.organizations,
  public.stations,
  public.profiles,
  public.profile_roles,
  public.barangays,
  public.gis_import_batches,
  public.responding_teams,
  public.team_members,
  public.ambulance_units,
  public.responses,
  public.dispatch_forms,
  public.dispatch_patients,
  public.pcr_reports,
  public.pcr_reports_with_response,
  public.pcr_vital_signs,
  public.pcr_medications,
  public.pcr_interventions,
  public.pcr_attachments,
  public.incidents,
  public.incident_media,
  public.notifications,
  public.notification_preferences,
  public.audit_logs,
  public.data_exports
to authenticated;

grant insert, update on
  public.organizations,
  public.stations,
  public.profiles,
  public.profile_roles,
  public.barangays,
  public.gis_import_batches,
  public.responding_teams,
  public.team_members,
  public.ambulance_units,
  public.responses,
  public.dispatch_forms,
  public.dispatch_patients,
  public.pcr_reports,
  public.pcr_vital_signs,
  public.pcr_medications,
  public.pcr_interventions,
  public.pcr_attachments,
  public.incidents,
  public.incident_media,
  public.notifications,
  public.notification_preferences,
  public.data_exports
to authenticated;

grant execute on function
  public.has_role(public.app_role),
  public.is_admin(),
  public.is_dispatcher(),
  public.is_field_responder(),
  public.current_station_id(),
  public.user_team_ids(),
  public.find_barangay_for_point(extensions.geography)
to authenticated;

commit;
