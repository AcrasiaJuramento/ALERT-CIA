-- ALERT-CIA base extensions.
-- Run first in a Supabase project.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

commit;
