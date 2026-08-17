-- Keep PCR archival reversible and distinct from soft deletion.
alter table public.pcr_reports
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists pcr_reports_archive_updated_idx
  on public.pcr_reports(archived_at, updated_at desc)
  where deleted_at is null;

create or replace function public.set_pcr_archived(target_pcr_id uuid, should_archive boolean)
returns public.pcr_reports
language plpgsql
security invoker
set search_path = public
as $$
declare
  result public.pcr_reports%rowtype;
begin
  update public.pcr_reports
  set archived_at = case when should_archive then now() else null end,
      archived_by = case when should_archive then auth.uid() else null end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_pcr_id
    and deleted_at is null
  returning * into result;

  if result.id is null then
    raise exception 'PCR record was not found or cannot be changed';
  end if;
  return result;
end;
$$;

revoke all on function public.set_pcr_archived(uuid, boolean) from public;
grant execute on function public.set_pcr_archived(uuid, boolean) to authenticated;
