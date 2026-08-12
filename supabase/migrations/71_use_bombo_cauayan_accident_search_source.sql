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
    "search_terms": ["accidents", "aksidente"],
    "search_urls": [
      "https://cauayan.bomboradyo.com/?s=accidents",
      "https://cauayan.bomboradyo.com/?s=aksidente"
    ]
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
