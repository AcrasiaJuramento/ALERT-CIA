# ALERT-CIA Scraper

The ALERT-CIA scraper is a separate Next.js service that discovers, extracts, classifies, geocodes, deduplicates, and stores accident-related public news reports for review inside the main ALERT-CIA system.

It is used by the **News Review** and **Location Matching** workflows in the main application. Scraped records are not automatically treated as verified emergency incidents; authorized users must review and confirm them.

## Current Source Coverage

The active source configuration is defined in `src/constants/sources.js`.

Current enabled source:

- Bombo Radyo Cauayan
- Search terms include accident-related variants such as `accidents`, `aksidente`, `banggan`, `salpukan`, and `crash`

## Main Features

- Public source discovery with pagination/search support.
- Article link extraction and article content extraction.
- Vehicular/incident classification.
- Location extraction and geocoding using Isabela/Echague-aware logic.
- Landmark registry support for locally verified location matching.
- Deduplication to reduce repeated reports.
- Source health/progress tracking.
- Supabase persistence for review in the main app.
- CORS handling for use by the ALERT-CIA frontend.
- User-authorized manual runs and secret-authorized cron update runs.

## Tech Stack

- Next.js
- React
- Supabase JS client
- Cheerio
- Node.js runtime for scraper API routes

## Project Structure

- `src/app/api/run/route.js` - run scraper endpoint
- `src/app/api/status/route.js` - scraper status endpoint
- `src/app/api/incidents/route.js` - scraped incidents endpoint
- `src/app/api/vehicular/route.js` - vehicular accident endpoint
- `src/app/api/analyze/route.js` - article analysis endpoint
- `src/lib/runScraper.js` - scraper orchestration
- `src/scrapers/scraper.js` - scraping implementation
- `src/lib/discoverLinks.js` - source discovery
- `src/lib/extractArticle.js` - article extraction
- `src/lib/classify.js` - incident classification
- `src/lib/geocode.js` - geocoding
- `src/lib/deduplication.js` - duplicate detection
- `src/lib/scraperStore.js` - persistence layer
- `src/constants/sources.js` - source configuration
- `src/cache` - local scraper cache files

## Environment Variables

Configure the scraper with Supabase and authorization values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CRON_SECRET=your_cron_secret
SCRAPER_CRON_SECRET=optional_alternate_cron_secret
ALERT_CIA_ALLOWED_ORIGINS=optional_comma_separated_origins
```

Only server-side code should use the Supabase service-role key.

## Development

From the repository root:

```bash
cmd /c npm run dev:scraper
```

Or from this folder:

```bash
cmd /c npm run dev
```

Default local URL:

```text
http://127.0.0.1:3000
```

## API Routes

Run scraper manually:

```text
POST /api/run
```

Run scraper through authorized cron:

```text
GET /api/run
Authorization: Bearer <CRON_SECRET>
```

Supported query parameters:

- `type=all|incidents|vehicular`
- `mode=update|full`
- `source=bombo`
- `pageFrom=1`
- `pageTo=3`

Other routes:

- `GET /api/status`
- `GET /api/incidents`
- `GET /api/vehicular`
- `POST /api/analyze`

## Build and Lint

```bash
cmd /c npm run build
cmd /c npm run lint
```

If `.next` output causes noise in parent-project linting, remove generated build output before running root-level lint.

## Review Workflow

1. Scraper discovers possible accident-related articles.
2. Article content is extracted and classified.
3. Location data is geocoded using known Isabela/Echague locations and landmark mappings.
4. Duplicates are reduced through URL/content/location matching.
5. Records are stored for review.
6. Authorized ALERT-CIA users review, correct, approve, reject, or map locations in the main app.

## Limitations

- Public websites may change structure and break extraction.
- Reports may be delayed, duplicated, incomplete, or inaccurate.
- Location extraction depends on article wording and available landmark data.
- Scraped records require human review before becoming official operational records.
- Current enabled source coverage is narrow and should be expanded only with reliable, permitted sources.
