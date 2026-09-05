# Supabase egress optimization

## Deployment and verification

Apply migrations **94, 95, and 96 in that order before deploying this frontend**. No production migration was executed from this workspace. Missing aggregate RPCs produce an error instead of silently falling back to downloading all internal records.

Verification completed locally:

- Production build.
- 68 Node tests, including existing PCR mapping, offline sync, risk scoring, routing, and six new cache/realtime tests.
- Isolated PostgreSQL contract tests using PGlite: execute the three migrations; exercise empty and populated summaries, date/bounds filtering, monthly/quarterly/annual reports, MVC grouping, midnight response segments, public grants and safe broadcasts.
- Targeted ESLint checks. The existing AuthContext hook-dependency warning is unrelated to this change.

Run SQL contracts without connecting to production:

```powershell
npm.cmd install --prefix "$env:TEMP\alert-cia-sql-qa" --no-audit --no-fund @electric-sql/pglite
node scripts/verify-egress-sql.mjs "$env:TEMP\alert-cia-sql-qa\node_modules\@electric-sql\pglite\dist\index.js"
```

The SQL fixtures use simplified geometry helpers and role functions. They do not substitute for testing the deployed PostGIS schema, production RLS policies, Supabase Broadcast delivery, or a real dispatch → field officer → PCR session. Browser discovery returned no available sessions, so live UI/panning and authenticated workflow checks remain deployment checks. Supabase byte usage has not been measured.

## Existing flow and changes

| Area | Previous query/flow | Implemented change |
| --- | --- | --- |
| Public scraper map | `listPublicScrapedMapIncidents`: source table, `raw_payload`, snippet, joined barangays/source metadata; minimum 1,000 rows; cache on failure only | Explicit safe view projection; default 200/max 500 per request; server date/bounds filters; normal cache reads. Event time and the existing news-severity rules run inside the view; article text never leaves PostgreSQL. |
| Public official incidents | Public incident query followed by verified-PCR ID and PCR metadata requests | `public_map_incidents_view` performs verification/severity lookups in PostgreSQL. No PCR lookup round trips or incident description/notes downloads. |
| Public PCR map | Public RPC with a fallback to full `PCR_SELECT` and incident enrichment | `public_pcr_map_incidents_view` with minimal fields. No fallback to internal PCR queries. Verified canonical records, deduplication and centroid fallback remain; centroid locations are explicitly marked approximate. |
| Shared public feed | Official + PCR + public scraper + officer scraper downloads | Three safe sources, shared cache/coalescing, no officer scraper request, no swallowed query failures that silently produce partial risk results. |
| Map movement | Entire capped dataset; no viewport query | 400 ms debounce, visible bounds, stale-response protection. Auto-fit is disabled for this viewport-driven map to prevent refetch/fit loops. |
| Public risk/navigation | Risk derived from arbitrarily capped lists | Page the lightweight 36-month history in batches of 500 and share/cache it for 30 minutes. Route warnings use the complete window independently of visible markers. Scoring code, recency tiers and risk thresholds are unchanged. |
| Public dashboard/log | Repeated full public feed reads | 10-minute cache-first data. Log has an explicit option to include records older than 36 months. |
| Reports | Up to 1,000 incidents, dispatches and PCRs, repeated every 30 seconds and every realtime event | `get_reports_summary(period)` returns category/period counts, response-merged spreadsheet sections and barangay totals. Existing Excel/PDF/print outputs consume aggregate rows. |
| Analytics | All-record RPC or paginated raw fallback, then JS summaries | Main Overview/Operations/MVC/PCR tabs use `get_analytics_summary`. Internal detailed map/drilldowns remain available on demand using the existing lightweight all-record RPC, cached for 30 minutes. Its raw fallback was removed. |
| Header active count | 500 enriched incident rows on multiple workflow events | Count-only HEAD request; no record response body; existing near-immediate scheduling remains. |
| Reference data | Existing 10-minute caches and coalescing | Barangays extended to 24 hours. Existing team/crew caching and 30-second live vehicle caching retained; no extra library. |
| Hazards/advisories | Wildcard public marker reads | Explicit public fields. Hazards share the public cache. Urgent advisory refresh stays immediate and uses a payload-free broadcast. |

Public source-table SELECT grants are revoked for `anon` on incidents, scraper records, PCR, responses, dispatch forms and dispatch patients. The new public views expose only approved/public records and explicit columns. Staff table permissions and operational RLS policies are not changed. The legacy public PCR RPC remains for compatibility; the new frontend does not call it.

## SQL objects

**94_public_data_layer.sql**

- `public_map_incidents_view`, `public_pcr_map_incidents_view`, `public_scraped_map_incidents_view`.
- Safe timestamp helper `public_map_event_time`.
- `broadcast_public_data_stale` and statement triggers on incidents, scraper records, PCR, hazards and public advisories. Messages contain `{}` and an event name, never the changed row. Advisory events have a separate immediate handler. A broadcast failure cannot abort a clinical/dispatch write.
- One index: `pcr_reports_verified_response_latest_idx(response_id, updated_at DESC, id)` restricted to live verified PCRs. Existing migrations 11/58/91 already cover source dates, public flags, types and foreign keys. Additional coordinate indexes should follow production `EXPLAIN (ANALYZE, BUFFERS)` evidence.

**95_aggregated_analytics.sql**

- `get_analytics_summary(start_date, end_date, location_scope)` with staff authorization and invoker/RLS access.
- Counts/groupings for incidents, barangays, types, severity, status, month, teams, receiving facilities, refusal-documentation indicators, emergency/trauma tags and MVC safety/completeness.
- Average response/scene durations, per-barangay/team workload, and monthly trend comparisons.
- Helpers: `analytics_distribution`, `analytics_minutes`, `analytics_has_crash`.
- Required time segments use the available fields: incident/call time → dispatch time; dispatch `sent_at` → officer `accepted_at`; acceptance → scene arrival; scene departure → hospital arrival; incident/call time → hospital arrival (scene arrival when no hospital arrival exists). Missing values are excluded and sample counts returned. Time-only overnight segments wrap once across midnight; they cannot establish multi-day durations without full timestamps. Refusal counts use the recorded waiver flag and do not infer a refusal from missing hospital data.

**96_reports_aggregation.sql**

- `get_reports_summary(period)` preserves month-of-year, quarter and annual report layouts, active PCR filtering and response-level dispatch/PCR merging, including multiple PCR tags.
- Helpers/aggregate: `report_token`, `report_crash_value`, `report_row_matches`, `report_merge_record`, `report_merge_records`.
- Existing report substring/symbol matching is intentionally retained; changing legacy clinical category rules is outside this optimization.

No synchronized duplicate source tables were added. Safe view/definer boundaries and explicit grants follow [Supabase's function-security guidance](https://supabase.com/docs/guides/database/functions). Empty public invalidations use [Supabase database Broadcast](https://supabase.com/docs/guides/realtime/broadcast).

## Cache and realtime behavior

- Shared read-through caches coalesce concurrent callers, clone results, cap entries and discard invalidated in-flight cache writes.
- Only safe public projections persist in browser storage, under new versioned keys. Internal analytics caches are memory-only and cleared on account changes.
- Successful public incident/scraper edits, publish/review RPCs and PCR saves clear affected cached data. Database broadcasts invalidate other clients; browser storage invalidations clear other tabs' memory caches.
- Public map/dashboard/history and Reports/Analytics use a 30-second informational refresh scheduler. Hidden tabs retain a stale flag and refresh once on visibility; events during a running refresh cause one follow-up.
- A shared 10-minute public expiry check recovers from missed broadcasts without bypassing fresh 30-minute risk history caches.
- Urgent advisory events and existing dispatch, assignment, officer acceptance, notifications, operational map and important PCR listeners keep their immediate/near-immediate behavior. Public advisory expiry polling remains visibility-gated.

## Egress expectations and limits

The largest savings should come from eliminating raw scraper/article payloads, full PCR/dispatch objects in Reports, repeated all-record analytics summaries, duplicate public/officer scraper reads and record downloads for header counts. Twenty events within one informational refresh window now produce one refresh rather than twenty (95% fewer refreshes for that burst). Reopening public screens within their cache lifetime normally produces no incident queries.

These are request-shape expectations, not measured Supabase byte savings. The first complete 36-month risk load can contain more rows than the old truncated feed, but each row is a safe projection and the history is shared. Detailed internal spatial analysis still loads record-level data intentionally. No claim is made that every operational query is now aggregate-only.

## Files changed

- UI: `src/app/pages/Analytics.jsx`, `ReportsAnalytics.jsx`, `public/PublicMap.jsx`, `public/PublicDashboard.jsx`, `public/PublicIncidentList.jsx`; `components/Layout.jsx`, `components/HazardWarningMonitor.jsx`, `components/map/LeafletIncidentMap.jsx`; `contexts/AuthContext.jsx`.
- Services: `src/app/services/supabase/{analyticsService,advisoryService,errors,hazardService,incidentService,pcrService,referenceService,scraperService,publicDataService,publicRealtime}.js`.
- Utilities/tests: `src/app/utils/{publicIncidentFeed,dataInvalidation,readThroughCache,informationalRefresh}.js`, `readThroughCache.test.js`, `informationalRefresh.test.js`; `scripts/verify-egress-sql.mjs`.
- Migrations 94–96 and this report.

SQLite schemas, local server mode, dispatch delivery, PCR serialization/synchronization, sync-engine logic and scoring formulas were intentionally left unchanged. PCR service edits affect public read paths and cache invalidation after successful saves, not the save payload or workflow transition itself.
