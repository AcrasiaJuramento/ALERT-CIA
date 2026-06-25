-- Add clearer scraper review statuses while keeping existing values for compatibility.

alter type public.scraper_record_status add value if not exists 'pending_review';
alter type public.scraper_record_status add value if not exists 'approved';
alter type public.scraper_record_status add value if not exists 'archived';
alter type public.scraper_record_status add value if not exists 'promoted';
