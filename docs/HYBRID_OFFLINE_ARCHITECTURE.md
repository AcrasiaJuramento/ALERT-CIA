# ALERT-CIA Hybrid Offline Architecture

This document records the first implementation slice for the hybrid web/PWA architecture. It preserves the current Supabase application and adds a foundation for cloud, local-server, and offline-device operation.

## Existing Architecture

- React 18 + Vite application under `src/app`.
- Supabase client configuration lives in `src/app/lib/supabaseClient.js`.
- Most database access is centralized under `src/app/services/supabase`.
- Dispatcher writes currently use `dispatch_forms`, `responses`, and `dispatch_patients`.
- PCR writes currently use `pcr_reports` and `pcr_vital_signs`.
- Authentication uses Supabase Auth plus `profiles` and `profile_roles`; the browser only receives publishable Supabase credentials.
- There was no PWA/service-worker configuration before this phase.

## IndexedDB Schema

Database: `alert-cia-hybrid`, version `1`.

Stores: `local_incidents`, `local_dispatches`, `local_assignments`, `local_pcr_reports`, `local_patients`, `local_vital_signs`, `local_treatments`, `local_transport_records`, `local_attachments`, `local_signatures`, `cached_reference_data`, `sync_queue`, `sync_logs`, `device_settings`, `conflict_records`.

Each local operational record carries UUID-first metadata: `local_id`, `server_id`, `entity_type`, `device_id`, `created_at_device`, `updated_at_device`, `version`, `source`, `sync_status`, `synced_to_local`, `synced_to_cloud`, `local_synced_at`, and `cloud_synced_at`.

## Supabase Sync Schema

Migration `42_hybrid_sync_foundation.sql` defines a cloud-side synchronization ledger, not a direct data-apply pipeline.

- `device_registrations`: each PWA, Android device, local server, or admin console has a server-side UUID, owning profile, station, device kind, status, credential metadata, offline-access expiry, revocation fields, and audit timestamps. Devices self-register as `pending`; admin/server workflows must activate them before they can upload sync operations.
- `sync_operations`: append-only style operation ledger with `operation_id`, `idempotency_key`, `request_nonce`, registered device references, owner profile, station, entity references, payload hash, retry state, destination flags, version fields, and timestamps from both device and cloud.
- `conflict_records`: durable conflict ledger preserving local and server copies, versions, assignment/resolution fields, severity, and links back to incident/dispatch/PCR records.

RLS is least privilege:

- Device owners can insert pending registrations and read their own registrations.
- Only active registered devices can insert pending sync operations for their owning profile.
- Users can read their own operations; admins can manage all; responders and dispatchers can read only operations tied to entities they already have business access to.
- Conflicts are readable by the reporting user, assigned reviewer, admins, or users already authorized for the linked entity.
- Update privileges are granted at the database level for service/admin workflows, but RLS only permits updates through admin policies unless later RPCs add narrower field-level behavior.

Replay and duplicate protection use unique `operation_id`, unique `idempotency_key`, unique `request_nonce`, registered device ownership checks, active/expiry checks, payload hashes, dependency ordering, and server-side status transitions.

## Local Server API Contract

Expected base URL is configured per device, for example `http://192.168.100.100:4000` or `http://alertcia.local:4000`.

- `GET /health`
- `POST /api/incidents`
- `POST /api/dispatches`
- `PUT /api/dispatches/:id`
- `POST /api/dispatches/:id/send`
- `POST /api/assignments/:id/acknowledge`
- `PUT /api/pcr-reports`
- `POST /api/pcr-reports/submit`
- `POST /api/sync/operations`

Requests include `X-ALERT-CIA-Device-ID`. The local server must validate a signed device credential or local access token before trusting the request, and forward the same `operation_id`, `idempotency_key`, `request_nonce`, `payload_hash`, device UUID, profile ID, and entity reference fields to Supabase.

## WebSocket Event Contract

Local dispatch socket URL: `ws(s)://<local-server>/dispatch`.

Events are JSON envelopes:

```json
{ "type": "new_dispatch", "payload": {}, "sent_at": "ISO-8601" }
```

Required event names: `new_dispatch`, `assignment_acknowledged`, `officer_accepted`, `dispatch_downloaded`, `unit_status_updated`, `pcr_available`, `presence`, `heartbeat`.

## Synchronization Protocol

Records are created with UUIDs before upload. The sync engine processes `sync_queue` in dependency order: incident, dispatch, assignment, acknowledgement, PCR, patient, assessment, vital signs, treatment, transport, handover, attachment, signature, completion status.

Operations retain an `operation_id` and `idempotency_key`. Retried operations must be upserted or ignored server-side without creating duplicates.

## Conflict Rules

- Unsynced drafts may be edited locally.
- Submitted PCR reports require controlled updates.
- Verified PCR reports must not be overwritten silently.
- Conflicts must be stored in `conflict_records`, preserve local and server copies, and require authorized review.

## Security Requirements

- Do not put Supabase service-role keys in browser code.
- The local server must authenticate users and devices; LAN access is not authorization.
- Device IDs generated by the browser are identifiers, not credentials.
- Add device registration, signed credentials, remote deactivation, local session lock, retention cleanup, and audit review before production rollout.

## Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_HEALTH_URL` optional, defaults to `<VITE_SUPABASE_URL>/functions/v1/health`

## Current Limitations

- This phase adds the web foundation and starts routing dispatcher/PCR writes through a hybrid repository.
- A production local server is still required.
- Supabase idempotent RPC functions still need to be implemented and connected.
- Attachment upload is tracked for IndexedDB storage, but cloud/local object-storage transfer is not complete.
- Conflict review UI is scaffolded by data contracts only.
- Expo Android should reuse the same UUID, operation, status, and WebSocket contracts.
