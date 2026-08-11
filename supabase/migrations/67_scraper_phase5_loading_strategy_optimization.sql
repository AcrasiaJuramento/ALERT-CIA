alter table public.scraper_article_candidates
  drop constraint if exists scraper_article_candidates_rejection_reason_check;

alter table public.scraper_article_candidates
  add constraint scraper_article_candidates_rejection_reason_check
  check (rejection_reason in (
    'non_accident',
    'non_vehicular',
    'outside_isabela',
    'location_unknown',
    'low_confidence',
    'duplicate',
    'fetch_failed',
    'extract_failed',
    'insufficient_information',
    'outside_date_range'
  ));
