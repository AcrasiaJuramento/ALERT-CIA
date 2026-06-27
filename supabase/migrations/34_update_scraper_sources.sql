-- Update the configured publisher registry.

begin;

delete from public.scraper_sources
where source_key in ('sunstar', 'pna', 'pilipino_star');

insert into public.scraper_sources(source_key, name, base_url, search_url, active, metadata)
values
  ('gma', 'GMA Network', 'https://www.gmanetwork.com', 'https://www.gmanetwork.com/news/tracking/isabela/1/', true,
    '{"pagination_type":"numbered_path","max_pages_full":50,"max_pages_update":3,"allowed_domains":["gmanetwork.com"]}'::jsonb),
  ('inquirer', 'Inquirer', 'https://www.inquirer.net', 'https://www.inquirer.net/search/?q=isabela#gsc.tab=0&gsc.q=isabela&gsc.page=1', true,
    '{"pagination_type":"google_cse_hash","max_pages_full":100,"max_pages_update":3,"allowed_domains":["inquirer.net"]}'::jsonb),
  ('bombo_cauayan', 'Bombo Radyo Cauayan', 'https://cauayan.bomboradyo.com', 'https://cauayan.bomboradyo.com/', true,
    '{"pagination_type":"wordpress_home","max_pages_full":100,"max_pages_update":3,"allowed_domains":["cauayan.bomboradyo.com"]}'::jsonb)
on conflict (source_key) do update
set name = excluded.name,
    base_url = excluded.base_url,
    search_url = excluded.search_url,
    active = excluded.active,
    metadata = excluded.metadata,
    updated_at = now();

commit;
