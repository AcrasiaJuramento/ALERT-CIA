-- Published advisories must be visible on public pages even when a visitor has
-- an authenticated session open in the same browser.

begin;

drop policy if exists public_read_published_advisories on public.public_advisories;

create policy public_read_published_advisories on public.public_advisories
for select to anon, authenticated
using (status = 'published' and deleted_at is null);

commit;
