# PCR Production Architecture

## Current-State Decisions

The React prototype remains local-storage based. `pcrStorage.js` now acts as a temporary domain repository: it applies ownership, synchronization, chronology validation, export, and audit behavior. Replace that repository with a Supabase implementation without changing page components.

The officer reports page filters by `created_by`, paginates after filtering, opens the complete printable report, and exports PDF through the browser print pipeline or a genuine `.docx` through the `docx` package. For production, generate official exports in a Supabase Edge Function, store immutable copies in Storage, and record their hashes.

## Domain Boundaries

- Identity and access: `profiles`, `roles`, `profile_roles`, `stations`.
- Dispatch: `incidents`, `vehicles`, `crew_assignments`.
- Clinical: `patients`, `pcr_reports`, `vital_signs`, `treatments`.
- Handover: `hospital_endorsements`, `transfers`.
- Evidence and governance: `attachments`, `audit_logs`.

This keeps repeatable observations and treatments out of the report row, avoids duplicated patient and facility workflow data, and preserves 3NF.

## Workflow Rules

- Arrival at hospital is the canonical timestamp. The application projects it into endorsement and transfer views; the database stores one canonical report timestamp plus related event timestamps.
- Hospital departure is generated once by `complete_hospital_handover()` after validated receiver confirmation. Normal officers must not directly update generated departure fields in the production API.
- Chronology is enforced in both React for immediate feedback and PostgreSQL constraints for integrity.
- Every write carries actor and timestamp metadata. Triggers capture report, endorsement, and transfer changes as JSONB audit events.

## Supabase API Pattern

- Use the authenticated Supabase client and rely on RLS; never accept a client-supplied officer ID as authorization.
- Select list columns only, use keyset pagination on `(updated_at, id)`, and fetch full report aggregates only for the detail route.
- Perform submit, verify, reject, and complete-handover transitions through database functions so validation, audit logging, and updates are atomic.
- Use signed Storage URLs with short expiry. Restrict attachment buckets by report access.

## Security Review

- Officer access is limited to reports they created.
- Supervisors can access reports from their assigned station.
- Administrators have full access.
- `security definer` functions set a fixed `search_path`.
- Clinical exports and attachments should be encrypted at rest, excluded from public buckets, and covered by retention policy.
- Add explicit grants after migration; revoke direct execution of transition functions from `anon`.

## Performance and Reporting

- Existing indexes support officer lists, station review queues, incident lookup, time-series vitals, and audit history.
- Use keyset pagination in production rather than large offsets.
- Add a materialized view for aggregate operational dashboards; do not run analytics over clinical detail tables on every page request.
- Use PostgreSQL full-text search for patient/report search and refresh reporting views asynchronously.

## Migration Strategy

1. Apply the schema in a staging Supabase project and seed roles/stations.
2. Backfill auth users, profiles, officers, patients, incidents, and reports in dependency order.
3. Convert local time strings to timezone-aware timestamps with the source station timezone.
4. Load child records, then reconcile counts, chronology failures, and orphan references.
5. Run RLS tests for officer, supervisor, administrator, and anonymous sessions.
6. Switch the repository adapter to Supabase behind a feature flag.
7. Run dual-write reconciliation briefly, then make Supabase authoritative and archive legacy data read-only.

## Recommended React Evolution

- Move report detail to `/admin/pcr/:id` for linkable, refresh-safe access.
- Introduce a `PCRRepository` interface with local and Supabase adapters.
- Use TanStack Query when Supabase is connected for cache, loading, errors, invalidation, and cursor pagination.
- Split the large form into step components and use React Hook Form with a shared schema validator.
- Keep workflow rules in domain functions and database procedures, not individual input handlers.
