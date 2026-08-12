-- Restrict the scraper registry to the Bombo Radyo source.

begin;

update public.scraper_sources
set active = false,
    metadata = coalesce(metadata, '{}'::jsonb) || '{"disabled_reason":"source_removed_from_scraper"}'::jsonb,
    updated_at = now()
where source_key <> 'bombo';

insert into public.scraper_sources(source_key, name, base_url, search_url, active, metadata)
values (
  'bombo',
  'Bombo Radyo',
  'https://news.bomboradyo.com',
  'https://news.bomboradyo.com/?s=isabela',
  true,
  '{"pagination_type":"wordpress_search","max_pages_full":100,"max_pages_update":3,"allowed_domains":["news.bomboradyo.com"]}'::jsonb
)
on conflict (source_key) do update
set name = excluded.name,
    base_url = excluded.base_url,
    search_url = excluded.search_url,
    active = true,
    metadata = excluded.metadata,
    updated_at = now();

commit;
