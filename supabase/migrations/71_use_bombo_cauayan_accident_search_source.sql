-- Point the single scraper source to Bombo Radyo Cauayan accident searches.

begin;

update public.scraper_sources
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"disabled_reason":"source_removed_from_scraper"}'::jsonb,
    updated_at = now()
where source_key <> 'bombo';

insert into public.scraper_sources(source_key, name, base_url, search_url, active, metadata)
values (
  'bombo',
  'Bombo Radyo Cauayan',
  'https://cauayan.bomboradyo.com',
  'https://cauayan.bomboradyo.com/?s=accidents',
  true,
  '{
    "pagination_type": "wordpress_search",
    "max_pages_full": 100,
    "max_pages_update": 3,
    "allowed_domains": ["cauayan.bomboradyo.com"],
    "search_terms": ["aksidente", "accidents", "banggaan", "disgrasya"],
    "search_urls": [
      "https://cauayan.bomboradyo.com/?s=aksidente",
      "https://cauayan.bomboradyo.com/?s=accidents",
      "https://cauayan.bomboradyo.com/?s=banggaan",
      "https://cauayan.bomboradyo.com/?s=disgrasya"
    ],
    "article_link_selector": ".td-ss-main-content .td_module_wrap h3.entry-title a[rel=''bookmark''], .td-ss-main-content h3.td-module-title a[rel=''bookmark'']"
  }'::jsonb
)
on conflict (source_key) do update
set name = excluded.name,
    base_url = excluded.base_url,
    search_url = excluded.search_url,
    active = true,
    metadata = excluded.metadata,
    updated_at = now();

commit;
