-- Keep the database source registry synchronized even before the first scraper run.

begin;

insert into public.scraper_sources(source_key, name, base_url, search_url, active, metadata)
values
  ('gma', 'GMA Network', 'https://www.gmanetwork.com', 'https://www.gmanetwork.com/news/regions/regions/list/isabela', true,
    '{"pagination_type":"next_link","max_pages_full":50,"max_pages_update":3,"allowed_domains":["gmanetwork.com"]}'::jsonb),
  ('bombo', 'Bombo Radyo', 'https://news.bomboradyo.com', 'https://news.bomboradyo.com/?s=isabela', true,
    '{"pagination_type":"wordpress_search","max_pages_full":100,"max_pages_update":3,"allowed_domains":["news.bomboradyo.com"]}'::jsonb),
  ('philstar', 'Philstar', 'https://www.philstar.com', 'https://www.philstar.com/search/isabela%20accident', true,
    '{"pagination_type":"query","max_pages_full":100,"max_pages_update":3,"allowed_domains":["philstar.com"]}'::jsonb),
  ('pna', 'Philippine News Agency', 'https://www.pna.gov.ph', 'https://www.pna.gov.ph/search?q=isabela', true,
    '{"pagination_type":"query","max_pages_full":100,"max_pages_update":3,"allowed_domains":["pna.gov.ph"]}'::jsonb),
  ('rappler', 'Rappler', 'https://www.rappler.com', 'https://www.rappler.com/search/?q=Isabela', true,
    '{"pagination_type":"query","max_pages_full":100,"max_pages_update":3,"allowed_domains":["rappler.com"]}'::jsonb),
  ('inquirer', 'Inquirer', 'https://newsinfo.inquirer.net', 'https://newsinfo.inquirer.net/search?module=all&query=Isabela', true,
    '{"pagination_type":"query","max_pages_full":100,"max_pages_update":3,"allowed_domains":["newsinfo.inquirer.net"]}'::jsonb),
  ('isabela_ppo', 'Isabela PPO', 'https://isabelappo.pro2.pnp.gov.ph', 'https://isabelappo.pro2.pnp.gov.ph/category/news/', true,
    '{"pagination_type":"wordpress_category","max_pages_full":50,"max_pages_update":3,"allowed_domains":["isabelappo.pro2.pnp.gov.ph"]}'::jsonb),
  ('cnn_ph', 'CNN Philippines', 'https://cnnphilippines.com', 'https://cnnphilippines.com/search/?q=isabela', false,
    '{"pagination_type":"next_link","max_pages_full":100,"max_pages_update":3,"allowed_domains":["cnnphilippines.com"],"disabled_reason":"source_inactive"}'::jsonb),
  ('manila_bulletin', 'Manila Bulletin', 'https://mb.com.ph', 'https://mb.com.ph/?s=isabela', true,
    '{"pagination_type":"wordpress_search","max_pages_full":100,"max_pages_update":3,"allowed_domains":["mb.com.ph"]}'::jsonb),
  ('abs_cbn', 'ABS-CBN', 'https://news.abs-cbn.com', 'https://news.abs-cbn.com/search-results?q=isabela', true,
    '{"pagination_type":"query","max_pages_full":100,"max_pages_update":3,"allowed_domains":["news.abs-cbn.com"]}'::jsonb),
  ('dzrh', 'DZRH', 'https://dzrhnews.com.ph', 'https://dzrhnews.com.ph/?s=isabela', true,
    '{"pagination_type":"wordpress_search","max_pages_full":100,"max_pages_update":3,"allowed_domains":["dzrhnews.com.ph"]}'::jsonb),
  ('pilipino_star', 'Pilipino Star Ngayon', 'https://www.pilipinostar.com', 'https://www.pilipinostar.com/?s=isabela', true,
    '{"pagination_type":"wordpress_search","max_pages_full":100,"max_pages_update":3,"allowed_domains":["pilipinostar.com"]}'::jsonb),
  ('sunstar', 'SunStar', 'https://www.sunstar.com.ph', 'https://www.sunstar.com.ph/search?search=isabela', true,
    '{"pagination_type":"query","max_pages_full":100,"max_pages_update":3,"allowed_domains":["sunstar.com.ph"]}'::jsonb),
  ('tribune', 'Daily Tribune', 'https://tribune.net.ph', 'https://tribune.net.ph/?s=isabela', true,
    '{"pagination_type":"wordpress_search","max_pages_full":100,"max_pages_update":3,"allowed_domains":["tribune.net.ph"]}'::jsonb),
  ('manila_times', 'Manila Times', 'https://www.manilatimes.net', 'https://www.manilatimes.net/?s=isabela', true,
    '{"pagination_type":"query","max_pages_full":100,"max_pages_update":3,"allowed_domains":["manilatimes.net"]}'::jsonb),
  ('daily_guardian', 'Daily Guardian', 'https://dailyguardian.com.ph', 'https://dailyguardian.com.ph/?s=isabela', true,
    '{"pagination_type":"wordpress_search","max_pages_full":100,"max_pages_update":3,"allowed_domains":["dailyguardian.com.ph"]}'::jsonb),
  ('brigada', 'Brigada News', 'https://www.brigadanews.ph', 'https://www.brigadanews.ph/category/local-news/luzon/isabela/', true,
    '{"pagination_type":"wordpress_category","max_pages_full":50,"max_pages_update":3,"allowed_domains":["brigadanews.ph"]}'::jsonb)
on conflict (source_key) do update
set name = excluded.name,
    base_url = excluded.base_url,
    search_url = excluded.search_url,
    active = excluded.active,
    metadata = excluded.metadata,
    updated_at = now();

commit;
