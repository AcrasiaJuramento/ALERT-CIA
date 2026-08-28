# ALERT-CIA

ALERT-CIA is a localized emergency response support system for MDRRMO command center operations. It combines incident monitoring, dispatch management, Patient Care Reports, public advisories, GIS mapping, analytics, audit logs, and standalone PCR device drafts in one React application.

## Main Capabilities

- Role-based access for administrators, dispatchers, and field responders.
- Incident list, incident details, and map monitoring.
- Dispatch creation, received dispatches, field responder navigation, and PCR handoff.
- Digital Patient Care Reports with review, archive, dashboard counts, and PDF/export utilities.
- Public dashboard, public incident list, and public map views.
- Hazard zones, accident-prone areas, barangay boundaries, heatmaps, and GPS-based warnings.
- Admin-only audit log history with sensitive field redaction.
- Device-saved standalone PCR drafts that sync to cloud when internet returns.
- News review and location matching for accident-related scraped reports.

## Tech Stack

- React 18 and Vite
- React Router
- Supabase Auth, Database, RLS, RPCs, Edge Functions, and migrations
- IndexedDB for standalone PCR drafts and pending cloud sync
- Leaflet and React Leaflet for maps
- Next.js scraper service under `alert-cia-scraper`

## Project Structure

- `src/app/pages` - application pages and workflows
- `src/app/components` - shared UI, layout, maps, status panels, and widgets
- `src/app/services/supabase` - Supabase data services
- `src/app/api` - cloud and standalone-PCR repository clients
- `src/app/sync` - browser sync engine and routing logic
- `src/app/db` - IndexedDB schema and repositories
- `src/app/network` - cloud connectivity checks and live events
- `supabase/migrations` - database schema, RLS, RPCs, indexes, audit logs, scraper, and sync migrations
- `supabase/functions` - Supabase Edge Functions
- `docs` - architecture and deployment notes
- `alert-cia-scraper` - separate Next.js scraper/API service

## Environment Variables

Create `.env` for the main app:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
VITE_SUPABASE_HEALTH_URL=optional_health_endpoint
```

## Development

Install dependencies:

```bash
cmd /c npm install
```

Start the main web app:

```bash
cmd /c npm run dev
```

Start the scraper service:

```bash
cmd /c npm run dev:scraper
```

Start app and supporting services together:

```bash
cmd /c npm run dev:all
```

## Build and Verification

Run automated tests:

```bash
cmd /c npm test
```

Build the production web app:

```bash
cmd /c npm run build
```

Run lint:

```bash
cmd /c npm run lint
```

Note: if generated `alert-cia-scraper/.next` output exists, full lint may include generated files. Remove generated build output or lint targeted source files when needed.

## Documentation

See:

- `docs/PCR_ARCHITECTURE.md`
- `docs/OFFICER_RBAC.md`
- `docs/SUPABASE_DATABASE_AUDIT.md`
- `docs/SUPABASE_SCHEMA_DEPLOYMENT.md`

## Current Production Notes

Before production rollout, verify Supabase migrations, RLS policies, browser draft handling, PCR legal/medical approval, and field testing with actual dispatchers and responders.
