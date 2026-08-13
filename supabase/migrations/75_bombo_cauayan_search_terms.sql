-- Align Bombo Cauayan scraper metadata with the active search pages.

begin;

update public.scraper_sources
set search_url = 'https://cauayan.bomboradyo.com/?s=accidents',
    metadata = coalesce(metadata, '{}'::jsonb)
      || '{
        "pagination_type": "wordpress_search",
        "search_terms": ["accidents", "aksidente", "banggan", "salpukan", "crash"],
        "search_urls": [
          "https://cauayan.bomboradyo.com/?s=accidents",
          "https://cauayan.bomboradyo.com/?s=aksidente",
          "https://cauayan.bomboradyo.com/?s=banggan",
          "https://cauayan.bomboradyo.com/?s=salpukan",
          "https://cauayan.bomboradyo.com/?s=crash"
        ],
        "search_page_pattern": "https://cauayan.bomboradyo.com/page/{page}/?s={term}"
      }'::jsonb,
    updated_at = now()
where source_key = 'bombo';

commit;
