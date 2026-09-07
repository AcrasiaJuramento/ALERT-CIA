-- Staff incident list filtering with database-side workflow checks and pagination.

begin;

drop function if exists public.list_incidents_paginated(
  integer,
  integer,
  text,
  text,
  text,
  boolean,
  boolean
);

create function public.list_incidents_paginated(
  page_limit integer default 200,
  page_offset integer default 0,
  filter_status text default null,
  filter_classification text default null,
  filter_priority text default null,
  filter_completed_workflow boolean default false,
  filter_verified_map boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered_incidents as materialized (
    select
      i.id,
      i.response_id,
      i.barangay_id,
      i.classification::text as classification,
      i.subtype,
      i.priority::text as priority,
      i.title,
      i.description,
      i.incident_date,
      i.incident_time,
      i.location_text,
      i.latitude,
      i.longitude,
      i.public_visible,
      i.record_origin,
      i.external_source_url,
      i.scraper_record_id,
      i.status::text as status,
      i.created_at,
      i.updated_at,
      b.name as barangay_name,
      rt.name as responding_team_name
    from public.incidents i
    left join public.barangays b on b.id = i.barangay_id
    left join public.responses r on r.id = i.response_id
    left join public.responding_teams rt on rt.id = r.responding_team_id
    where i.deleted_at is null
      and (filter_status is null or i.status::text = filter_status)
      and (filter_classification is null or i.classification::text = filter_classification)
      and (filter_priority is null or i.priority::text = filter_priority)
      and (
        not filter_completed_workflow
        or (
          i.response_id is not null
          and exists (
            select 1
            from public.dispatch_forms d
            where d.response_id = i.response_id
              and d.status in ('pcr_completed', 'verified')
              and d.deleted_at is null
          )
          and exists (
            select 1
            from public.pcr_reports p
            where p.response_id = i.response_id
              and p.status in ('completed', 'verified')
              and p.deleted_at is null
          )
        )
      )
      and (
        not filter_verified_map
        or (
          i.response_id is not null
          and exists (
            select 1
            from public.pcr_reports p
            where p.response_id = i.response_id
              and p.status = 'verified'
              and p.deleted_at is null
          )
        )
      )
  )
  , paged_incidents as (
    select *
    from filtered_incidents
    order by incident_date desc, updated_at desc, id
    limit greatest(0, coalesce(page_limit, 200))
    offset greatest(0, coalesce(page_offset, 0))
  )
  select jsonb_build_object(
    'data',
    coalesce(
      (
        select jsonb_agg(to_jsonb(paged_incidents) order by incident_date desc, updated_at desc, id)
        from paged_incidents
      ),
      '[]'::jsonb
    ),
    'count',
    (select count(*) from filtered_incidents)
  );
$$;

revoke execute on function public.list_incidents_paginated(integer, integer, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.list_incidents_paginated(integer, integer, text, text, text, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
