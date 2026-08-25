-- Recover the canonical PCR response link before invoking the existing sync
-- implementation. This also supports older cached clients whose PCR payload
-- contains a dispatch/PCR identifier but omits responseId.

begin;

do $$
begin
  if to_regprocedure('public.sync_offline_pcr_report_base(jsonb,jsonb,boolean)') is null then
    alter function public.sync_offline_pcr_report(jsonb, jsonb, boolean)
      rename to sync_offline_pcr_report_base;
  end if;
end
$$;

create or replace function public.sync_offline_pcr_report(
  report_payload jsonb,
  vital_payload jsonb default '[]'::jsonb,
  submit_report boolean default false
)
returns public.pcr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  repaired_payload jsonb := coalesce(report_payload, '{}'::jsonb);
  candidate_response_id uuid;
  candidate_dispatch_id uuid;
  candidate_pcr_id uuid;
  canonical_response_id uuid;
  canonical_dispatch_id uuid;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if lower(coalesce(repaired_payload->>'responseId', '')) ~ uuid_pattern then
    candidate_response_id := (repaired_payload->>'responseId')::uuid;
  elsif lower(coalesce(repaired_payload->>'responseClientId', '')) ~ uuid_pattern then
    candidate_response_id := (repaired_payload->>'responseClientId')::uuid;
  end if;

  if lower(coalesce(repaired_payload->>'dispatchId', '')) ~ uuid_pattern then
    candidate_dispatch_id := (repaired_payload->>'dispatchId')::uuid;
  elsif lower(coalesce(repaired_payload->>'dispatchClientId', '')) ~ uuid_pattern then
    candidate_dispatch_id := (repaired_payload->>'dispatchClientId')::uuid;
  end if;

  if lower(coalesce(repaired_payload->>'id', '')) ~ uuid_pattern then
    candidate_pcr_id := (repaired_payload->>'id')::uuid;
  elsif lower(coalesce(repaired_payload->>'pcrId', '')) ~ uuid_pattern then
    candidate_pcr_id := (repaired_payload->>'pcrId')::uuid;
  elsif lower(coalesce(repaired_payload->>'pcrClientId', '')) ~ uuid_pattern then
    candidate_pcr_id := (repaired_payload->>'pcrClientId')::uuid;
  end if;

  if candidate_response_id is not null then
    select r.id
    into canonical_response_id
    from public.responses r
    where (r.id = candidate_response_id or r.client_generated_id = candidate_response_id)
      and r.deleted_at is null
    order by case when r.id = candidate_response_id then 0 else 1 end, r.updated_at desc
    limit 1;
  end if;

  if canonical_response_id is null and candidate_dispatch_id is not null then
    select d.response_id, d.id
    into canonical_response_id, canonical_dispatch_id
    from public.dispatch_forms d
    where (d.id = candidate_dispatch_id or d.client_generated_id = candidate_dispatch_id)
      and d.deleted_at is null
    order by case when d.id = candidate_dispatch_id then 0 else 1 end, d.updated_at desc
    limit 1;
  end if;

  if canonical_response_id is null and candidate_pcr_id is not null then
    select p.response_id, p.dispatch_form_id
    into canonical_response_id, canonical_dispatch_id
    from public.pcr_reports p
    where (p.id = candidate_pcr_id or p.client_generated_id = candidate_pcr_id)
      and p.deleted_at is null
    order by case when p.id = candidate_pcr_id then 0 else 1 end, p.updated_at desc
    limit 1;
  end if;

  if canonical_response_id is null and nullif(trim(repaired_payload->>'responseNumber'), '') is not null then
    select r.id
    into canonical_response_id
    from public.responses r
    where r.response_number = trim(repaired_payload->>'responseNumber')
      and r.deleted_at is null
    limit 1;
  end if;

  if canonical_dispatch_id is null and canonical_response_id is not null then
    select d.id
    into canonical_dispatch_id
    from public.dispatch_forms d
    where d.response_id = canonical_response_id
      and d.deleted_at is null
    order by d.updated_at desc
    limit 1;
  end if;

  if canonical_response_id is not null then
    repaired_payload := jsonb_set(repaired_payload, '{responseId}', to_jsonb(canonical_response_id::text), true);
  end if;
  if canonical_dispatch_id is not null then
    repaired_payload := jsonb_set(repaired_payload, '{dispatchId}', to_jsonb(canonical_dispatch_id::text), true);
  end if;

  return public.sync_offline_pcr_report_base(repaired_payload, vital_payload, submit_report);
end
$$;

revoke execute on function public.sync_offline_pcr_report_base(jsonb, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) to authenticated;

commit;
