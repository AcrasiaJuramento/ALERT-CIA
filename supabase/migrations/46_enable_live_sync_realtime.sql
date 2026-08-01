-- Enable live status feeds for dispatcher and field-officer sync views.
-- Safe to run repeatedly: only adds tables to supabase_realtime when missing.

alter table if exists public.dispatch_forms replica identity full;
alter table if exists public.responses replica identity full;
alter table if exists public.pcr_reports replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dispatch_forms'
  ) then
    execute 'alter publication supabase_realtime add table public.dispatch_forms';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'responses'
  ) then
    execute 'alter publication supabase_realtime add table public.responses';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pcr_reports'
  ) then
    execute 'alter publication supabase_realtime add table public.pcr_reports';
  end if;
end $$;

