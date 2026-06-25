-- Performance indexes for 100k+ record workloads.

begin;

create index if not exists profiles_station_status_idx on public.profiles(station_id, account_status) where deleted_at is null;
create index if not exists profile_roles_role_idx on public.profile_roles(role, profile_id);

create index if not exists barangays_name_trgm_idx on public.barangays using gin(name gin_trgm_ops);
create index if not exists barangays_boundary_gix on public.barangays using gist(boundary);

create index if not exists team_members_profile_active_idx on public.team_members(profile_id) where left_at is null;
create index if not exists team_members_team_active_idx on public.team_members(team_id) where left_at is null;

create index if not exists responses_number_idx on public.responses(response_number);
create index if not exists responses_team_status_idx on public.responses(responding_team_id, status, updated_at desc) where deleted_at is null;
create index if not exists responses_barangay_date_idx on public.responses(barangay_id, date_of_incident desc) where deleted_at is null;
create index if not exists responses_created_idx on public.responses(created_at desc);

create index if not exists dispatch_forms_response_idx on public.dispatch_forms(response_id);
create index if not exists dispatch_forms_status_idx on public.dispatch_forms(status, updated_at desc) where deleted_at is null;

create index if not exists pcr_reports_response_idx on public.pcr_reports(response_id);
create index if not exists pcr_reports_status_idx on public.pcr_reports(status, updated_at desc) where deleted_at is null;
create index if not exists pcr_reports_created_by_idx on public.pcr_reports(created_by, updated_at desc);
create index if not exists pcr_vitals_report_idx on public.pcr_vital_signs(pcr_report_id, measured_time);

create index if not exists incidents_response_idx on public.incidents(response_id);
create index if not exists incidents_barangay_date_idx on public.incidents(barangay_id, incident_date desc);
create index if not exists incidents_priority_date_idx on public.incidents(priority, incident_date desc);
create index if not exists incidents_location_gix on public.incidents using gist(location);

create index if not exists notifications_profile_unread_idx on public.notifications(recipient_profile_id, created_at desc) where read_at is null;
create index if not exists notifications_team_unread_idx on public.notifications(recipient_team_id, created_at desc) where read_at is null;
create index if not exists audit_logs_record_idx on public.audit_logs(table_name, record_id, created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_profile_id, created_at desc);

commit;
