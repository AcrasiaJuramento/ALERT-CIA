-- Speed up rejected URL memory checks and expose a de-duplicated review view.

begin;

create index if not exists scraper_article_candidates_source_url_created_idx
  on public.scraper_article_candidates(source_url, created_at desc);

create index if not exists scraper_article_candidates_source_site_created_idx
  on public.scraper_article_candidates(source_site, created_at desc);

create or replace view public.scraper_latest_article_candidates
with (security_invoker = true)
as
select distinct on (source_url)
  id,
  run_id,
  source_id,
  source_site,
  source_url,
  source_hash,
  article_content_hash,
  title,
  snippet,
  published_at,
  detected_incident_type,
  classification_confidence,
  classification_score,
  classification_reason,
  matched_terms,
  rejection_reason,
  rejection_details,
  raw_location_text,
  extracted_province,
  extracted_municipality,
  extracted_barangay,
  extracted_purok_sitio,
  extracted_road,
  location_confidence,
  raw_payload,
  created_at
from public.scraper_article_candidates
order by source_url, created_at desc, id desc;

grant select on public.scraper_latest_article_candidates to authenticated;

notify pgrst, 'reload schema';

commit;
