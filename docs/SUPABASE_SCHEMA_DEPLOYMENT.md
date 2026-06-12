# ALERT-CIA Supabase Schema Deployment

Use `supabase/ALERT_CIA_COMPLETE_SCHEMA.sql` for a new Supabase project. It is the consolidated schema derived from the application pages, PCR workflow, mock data, public map, analytics, settings, notifications, registration, incident dispatch, and user-management flows.

## Deployment

1. Create a new Supabase project.
2. Open the SQL Editor and run the complete schema file once.
3. Create the first administrator in Supabase Authentication.
4. Run the commented first-admin bootstrap statements at the bottom of the schema using that administrator's email.
5. Test RLS with separate administrator, supervisor, dispatcher, operations-officer, field-responder, public-user, and anonymous sessions.

## Storage Convention

Storage policies require the owning record UUID as the first folder:

- `incident-attachments/<incident_uuid>/<file>`
- `pcr-attachments/<pcr_uuid>/<file>`
- `pcr-signatures/<pcr_uuid>/<file>`

## Application Integration

- Read public incident data from `public_incidents`, not `incidents`.
- Read current public alerts from `active_public_alerts`.
- Submit reports through `submit_pcr(report_id)`.
- Complete handover through `complete_hospital_handover(report_id)`.
- Verify or reject reports through `review_pcr(report_id, decision, comments)`.
- Use cursor pagination on `(updated_at, id)` for reports and `(reported_at, id)` for incidents.

`supabase/migrations/001_enterprise_pcr.sql` is identical to the consolidated schema and is the executable migration for fresh deployments.
