# ALERT-CIA Supabase Database Audit

Date: 2026-08-01

## Executive Summary

The ALERT-CIA app captures more fields than the original normalized Supabase schema contains as first-class columns. Core operational fields are stored in normalized tables (`responses`, `dispatch_forms`, `dispatch_patients`, `pcr_reports`, `pcr_vital_signs`, `pcr_medications`, `pcr_interventions`, `pcr_attachments`). Full clinical/dispatch form fidelity is preserved in structured JSON inside the existing `notes` column under `__alertCiaExtended`.

The largest bug found was that the offline-to-cloud PCR RPC path received raw PCR payloads and wrote plain `notes`, bypassing the mapper serialization used by direct online saves. This caused offline-entered fields to sync cloud core columns but lose extended form sections on cloud fetch. The client now sends serialized extended notes to the RPC path.

## Tables Audited

- `responses`: response number, incident date/time/location, caller, first patient summary, team/unit, dispatch state.
- `dispatch_forms`: dispatch timeline, number of patients, assistance, status, sent time.
- `dispatch_patients`: patient rows linked to dispatch forms.
- `pcr_reports`: PCR status and core clinical summary columns.
- `pcr_vital_signs`: repeated vital-sign rows.
- `pcr_medications`: repeated medication rows.
- `pcr_interventions`: intervention checklist rows and details.
- `pcr_attachments`: attachment metadata rows.
- `sync_operations`, `device_registrations`, `conflict_records`, `sync_id_mappings`: hybrid sync support.

## Key Findings

1. **Schema coverage gap**
   Many UI fields do not have dedicated SQL columns. Examples: signatures, body map marks, GCS repeated rows, allergies, pain assessment, waiver fields, smoking/alcohol history, obstetric details, vehicle crash details, and annotation data. These are now preserved through structured JSON and displayed through shared mappers.

2. **Offline PCR RPC serialization gap**
   `sync_offline_pcr_report()` wrote `report_payload->>'notes'`. Before the patch, the raw payload notes were plain operator notes, not the extended serialized payload. Offline PCR submissions could therefore show `NULL`/blank values after cloud reload.

3. **Child table write gap**
   The cloud client previously replaced only `pcr_vital_signs`. `pcr_medications`, `pcr_interventions`, and `pcr_attachments` existed but were not populated from the app. These child tables are now written during PCR save/submit.

4. **Fetch fallback gap**
   Empty child table arrays could overwrite richer extended JSON values during hydration. The PCR mapper now falls back to extended JSON when child tables are empty.

5. **Dispatch/PCR relationship**
   PCR sync requires a valid `response_id`. The RPC validates assigned responding team authorization and links to the canonical `dispatch_form_id` by response when needed. This avoids duplicate PCR records and enforces one PCR per response.

6. **RLS model**
   Current policy shape is appropriate for least privilege:
   - Admins can manage all.
   - Dispatchers manage dispatch/response records.
   - Field officers manage PCRs only through assigned responding-team responses.
   - Field officers do not directly write `dispatch_patients`; PCR RPC updates patient summaries safely after authorization.

## Persistence Rules

- Every user-entered field must be included in either:
  - A normalized query column/table used for filtering, analytics, joins, and status workflows.
  - The structured extended payload for full form replay and previews.

- Core query fields should stay normalized:
  - Response number
  - Incident date/time/location/barangay/coordinates
  - Caller and first patient summary
  - Responding team/unit/driver/aider names
  - Dispatch/PCR statuses
  - Triage, chief complaint, emergency/trauma types
  - Hospital/endorsement summary
  - Repeated vitals, medications, interventions, attachment metadata

- High-cardinality clinical sections are currently serialized:
  - GCS rows
  - Body map
  - Signature pads
  - Waiver fields
  - Pain/allergy/history/smoking/alcohol details
  - Obstetric and crash detail objects
  - Annotation and attachment data

## Deployment Checks

After deploying this code:

1. Create a dispatch with patient, nature, location, team, vehicle, driver, main aider, group leader, and assistant aider.
2. Send through offline LAN.
3. Accept as Field Officer and complete PCR with:
   - Multiple vital rows
   - Multiple GCS rows
   - Medication rows
   - Intervention checklist and details
   - Signatures
   - Waiver/notes/body map
4. Submit while offline/LAN.
5. Reconnect cloud and run Sync Now.
6. Verify Supabase:
   - `responses` has response, patient, location, and team data.
   - `dispatch_forms` is linked to `responses.id`.
   - `dispatch_patients` has the first patient summary.
   - `pcr_reports` has status, triage, complaint, types, hospital fields, and JSON extended payload in `notes`.
   - `pcr_vital_signs`, `pcr_medications`, `pcr_interventions`, and `pcr_attachments` contain child rows where applicable.
7. Reopen Dispatcher records, Field Officer PCR records, Admin PCR preview, Review Details, Reports, and Analytics. Values should match without refresh-only behavior.

## Recommended Future Migration

For long-term maintainability, add explicit `form_data jsonb not null default '{}'::jsonb` columns to `dispatch_forms` and `pcr_reports`, then migrate the current `notes->__alertCiaExtended` payload into `form_data`. Keep `notes` as human operator notes only. Do this in a controlled migration because sending a new `form_data` column before Supabase is migrated will break older deployments.
