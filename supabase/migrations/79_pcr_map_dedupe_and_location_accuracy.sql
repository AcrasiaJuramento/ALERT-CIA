-- Keep PCR map records realistic: one active normal PCR per response, with
-- older duplicates archived instead of hard-deleted.

begin;

create table if not exists public.pcr_report_duplicate_archive (
  duplicate_id uuid primary key,
  kept_id uuid not null,
  response_id uuid not null,
  archived_row jsonb not null,
  archived_at timestamptz not null default now()
);

with ranked as (
  select
    p.*,
    first_value(p.id) over (
      partition by p.response_id
      order by
        case p.status
          when 'verified' then 0
          when 'completed' then 1
          when 'submitted' then 2
          when 'in_progress' then 3
          else 4
        end,
        p.updated_at desc nulls last,
        p.created_at desc nulls last
    ) as kept_id,
    row_number() over (
      partition by p.response_id
      order by
        case p.status
          when 'verified' then 0
          when 'completed' then 1
          when 'submitted' then 2
          when 'in_progress' then 3
          else 4
        end,
        p.updated_at desc nulls last,
        p.created_at desc nulls last
    ) as rank
  from public.pcr_reports p
  where p.response_id is not null
    and p.deleted_at is null
    and coalesce(p.workflow_origin, 'normal') <> 'reverse'
),
duplicates as (
  select * from ranked where rank > 1
)
insert into public.pcr_report_duplicate_archive (duplicate_id, kept_id, response_id, archived_row)
select id, kept_id, response_id, to_jsonb(duplicates)
from duplicates
on conflict (duplicate_id) do nothing;

with ranked as (
  select
    p.id,
    row_number() over (
      partition by p.response_id
      order by
        case p.status
          when 'verified' then 0
          when 'completed' then 1
          when 'submitted' then 2
          when 'in_progress' then 3
          else 4
        end,
        p.updated_at desc nulls last,
        p.created_at desc nulls last
    ) as rank
  from public.pcr_reports p
  where p.response_id is not null
    and p.deleted_at is null
    and coalesce(p.workflow_origin, 'normal') <> 'reverse'
)
update public.pcr_reports p
set deleted_at = now(),
    updated_at = now()
from ranked
where p.id = ranked.id
  and ranked.rank > 1;

create unique index if not exists pcr_reports_response_active_unique_idx
  on public.pcr_reports(response_id)
  where response_id is not null
    and deleted_at is null
    and coalesce(workflow_origin, 'normal') <> 'reverse';

create or replace function public.public_pcr_map_incidents(max_rows integer default 100)
returns table (
  pcr_id uuid,
  incident_id uuid,
  response_id uuid,
  classification text,
  priority text,
  location_text text,
  barangay text,
  latitude numeric,
  longitude numeric,
  incident_date date,
  incident_time time,
  incident_status text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with canonical_pcr as (
    select distinct on (p.response_id)
      p.*
    from public.pcr_reports p
    where p.deleted_at is null
      and p.response_id is not null
      and p.status in ('verified', 'completed')
    order by p.response_id,
      case p.status
        when 'verified' then 0
        when 'completed' then 1
        else 2
      end,
      p.updated_at desc nulls last
  )
  select
    p.id as pcr_id,
    i.id as incident_id,
    p.response_id,
    coalesce(i.classification::text, public.classify_response_incident(coalesce(p.incident_nature, r.type_of_incident))::text) as classification,
    coalesce(i.priority::text, public.priority_from_pcr_triage(p.triage)::text, 'medium') as priority,
    coalesce(i.location_text, r.location_text, r.place_of_incident, b.name) as location_text,
    b.name as barangay,
    coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)) as latitude,
    coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)) as longitude,
    coalesce(i.incident_date, r.date_of_incident, p.completed_at::date, p.submitted_at::date, p.created_at::date) as incident_date,
    coalesce(i.incident_time, r.time_of_incident) as incident_time,
    coalesce(i.status::text, case when p.status = 'completed' then 'completed' else 'on_scene' end) as incident_status
  from canonical_pcr p
  left join public.responses r on r.id = p.response_id and r.deleted_at is null
  left join public.incidents i on i.response_id = p.response_id and i.deleted_at is null
  left join public.barangays b on b.id = coalesce(i.barangay_id, r.barangay_id)
  where coalesce(i.latitude, r.latitude, extensions.ST_Y(b.centroid::extensions.geometry)) is not null
    and coalesce(i.longitude, r.longitude, extensions.ST_X(b.centroid::extensions.geometry)) is not null
  order by coalesce(i.incident_date, r.date_of_incident, p.completed_at::date, p.submitted_at::date, p.created_at::date) desc
  limit greatest(1, least(coalesce(max_rows, 100), 500));
$$;

grant select on public.pcr_report_duplicate_archive to authenticated;
grant execute on function public.public_pcr_map_incidents(integer) to anon, authenticated;

commit;
