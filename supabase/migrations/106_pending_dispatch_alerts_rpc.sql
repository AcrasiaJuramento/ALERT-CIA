-- Compact, server-filtered dispatch alarm reads.
-- Validate the plan in Supabase SQL editor after deployment with:
-- explain (analyze, buffers)
-- select * from public.get_pending_dispatch_alerts(null::uuid[], null::uuid[]);

begin;

drop function if exists public.get_pending_dispatch_alerts(uuid[], uuid[]);

create or replace function public.get_pending_dispatch_alerts(
  target_team_ids uuid[] default null,
  target_response_id uuid default null
)
returns table (
  dispatch_id uuid,
  dispatch_client_generated_id text,
  response_id uuid,
  response_number text,
  dispatch_status public.dispatch_status,
  sent_at timestamptz,
  dispatch_created_at timestamptz,
  dispatch_updated_at timestamptz,
  notes text,
  assistance_needed text[],
  number_of_patients integer,
  incident_date date,
  incident_time time,
  place_of_incident text,
  type_of_incident text,
  caller_name text,
  caller_contact text,
  caller_address text,
  initial_assessment text,
  responding_team_id uuid,
  responding_team_name text,
  barangay_name text,
  accepted_at timestamptz,
  resolved_at timestamptz,
  response_status public.dispatch_status
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id,
    d.client_generated_id::text,
    r.id,
    r.response_number,
    d.status,
    d.sent_at,
    d.created_at,
    d.updated_at,
    d.notes,
    d.assistance_needed,
    d.number_of_patients,
    r.date_of_incident,
    r.time_of_incident,
    r.place_of_incident,
    r.type_of_incident,
    r.caller_name,
    r.caller_contact,
    r.caller_address,
    r.initial_assessment,
    r.responding_team_id,
    t.name,
    b.name,
    r.accepted_at,
    r.resolved_at,
    r.status
  from public.dispatch_forms d
  join public.responses r on r.id = d.response_id
  left join public.responding_teams t on t.id = r.responding_team_id
  left join public.barangays b on b.id = r.barangay_id
  where d.deleted_at is null
    and r.deleted_at is null
    -- "Sent to Field Officer" is a client/display alias for this database enum value.
    and d.status = 'sent_to_responding_team'
    and r.accepted_at is null
    and r.resolved_at is null
    and r.responding_team_id in (select public.user_team_ids())
    and (target_team_ids is null or r.responding_team_id = any(target_team_ids))
    and (target_response_id is null or r.id = target_response_id)
  order by coalesce(d.sent_at, d.created_at), d.id;
$$;

revoke execute on function public.get_pending_dispatch_alerts(uuid[], uuid[]) from public, anon;
grant execute on function public.get_pending_dispatch_alerts(uuid[], uuid[]) to authenticated;

commit;

-- Refresh PostgREST's function catalog after applying this migration.
notify pgrst, 'reload schema';

-- Do not add another index until this plan is measured against production-like data.
-- Existing candidates are dispatch_forms_status_updated_active_idx,
-- responses_team_status_idx, and dispatch_forms_response_idx.

-- Verify deployment with:
-- select n.nspname as schema_name,
--        p.proname as function_name,
--        pg_get_function_identity_arguments(p.oid) as arguments
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname = 'get_pending_dispatch_alerts';

-- If the application still returns PGRST202, run this separately in SQL Editor:
-- select to_regprocedure('public.get_pending_dispatch_alerts(uuid[],uuid[])');
-- It must return public.get_pending_dispatch_alerts(uuid[],uuid[]).
