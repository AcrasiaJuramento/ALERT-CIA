-- Structured PCR correction targets shared by Web and Mobile.
alter table public.pcr_reports
  add column if not exists correction_targets jsonb not null default '[]'::jsonb,
  add column if not exists correction_reason text;

alter table public.pcr_dispatch_workflow_history
  add column if not exists correction_targets jsonb not null default '[]'::jsonb;

alter table public.pcr_reports drop constraint if exists pcr_reports_correction_targets_array_check;
alter table public.pcr_reports add constraint pcr_reports_correction_targets_array_check
  check (jsonb_typeof(correction_targets) = 'array');

create or replace function public.review_pcr_with_corrections(
  target_pcr_id uuid,
  review_kind text,
  decision text,
  remarks text default null,
  correction_targets jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_id uuid;
  normalized_targets jsonb := coalesce(correction_targets, '[]'::jsonb);
begin
  if jsonb_typeof(normalized_targets) <> 'array' then
    raise exception 'Correction targets must be a JSON array';
  end if;
  if decision in ('return', 'reject') and jsonb_array_length(normalized_targets) = 0 then
    raise exception 'Select at least one PCR field or section requiring correction';
  end if;

  if review_kind = 'dispatcher' then
    result_id := public.review_standalone_pcr(target_pcr_id, decision, remarks);
  elsif review_kind = 'reverse_admin' then
    result_id := public.review_reverse_workflow_admin(target_pcr_id, decision, remarks);
  elsif review_kind = 'normal_admin' then
    result_id := public.review_normal_pcr_admin(target_pcr_id, decision, remarks);
  else
    raise exception 'Unsupported PCR review kind';
  end if;

  update public.pcr_reports
  set correction_targets = case when decision in ('return', 'reject') then normalized_targets else '[]'::jsonb end,
      correction_reason = case when decision in ('return', 'reject') then remarks else null end,
      updated_at = now()
  where id = target_pcr_id;

  update public.pcr_dispatch_workflow_history
  set correction_targets = normalized_targets
  where id = (
    select id from public.pcr_dispatch_workflow_history
    where pcr_report_id = target_pcr_id
    order by created_at desc limit 1
  );

  return result_id;
end;
$$;

grant execute on function public.review_pcr_with_corrections(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.clear_active_pcr_corrections_after_resubmit()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('returned_to_field_officer', 'returned_for_correction', 'rejected')
     and new.status not in ('returned_to_field_officer', 'returned_for_correction', 'rejected') then
    new.correction_targets := '[]'::jsonb;
    new.correction_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_active_pcr_corrections_after_resubmit on public.pcr_reports;
create trigger clear_active_pcr_corrections_after_resubmit
before update of status on public.pcr_reports
for each row execute function public.clear_active_pcr_corrections_after_resubmit();

select pg_notify('pgrst', 'reload schema');
