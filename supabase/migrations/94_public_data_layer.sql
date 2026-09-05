begin;

-- Safe projections over existing records.
-- The owner evaluates private PCR joins;
-- callers receive only explicitly listed public columns and published rows.

create or replace view public.public_map_incidents_view
with (security_barrier = true) as
select
  i.id,
  i.classification::text,
  i.priority::text,
  (i.classification::text || ' safety alert') as title,
  i.incident_date,
  i.incident_time,
  i.location_text,
  i.latitude,
  i.longitude,
  i.status::text,
  b.name as barangay_name,

  exists(
    select 1
    from public.pcr_reports p
    where p.response_id = i.response_id
      and p.deleted_at is null
      and p.status = 'verified'
  ) as is_verified,

  (
    select p.triage
    from public.pcr_reports p
    where p.response_id = i.response_id
      and p.deleted_at is null
      and p.status = 'verified'
    order by p.updated_at desc nulls last, p.id
    limit 1
  ) as map_severity

from public.incidents i
left join public.barangays b
  on b.id = i.barangay_id

where i.public_visible = true
  and i.deleted_at is null
  and i.status::text not in (
    'draft',
    'pending_admin_verification',
    'cancelled',
    'rejected',
    'returned_for_correction'
  )
  and i.latitude is not null
  and i.longitude is not null;


-- ---------------------------------------------------------------------------
-- Verified PCR map records
-- ---------------------------------------------------------------------------

create or replace view public.public_pcr_map_incidents_view
with (security_barrier = true) as

with canonical as (
  select distinct on (p.response_id)
    p.id,
    p.response_id,
    p.triage,
    p.incident_nature,
    p.verified_at,
    p.submitted_at,
    p.created_at
  from public.pcr_reports p
  where p.deleted_at is null
    and p.status = 'verified'
    and p.response_id is not null
  order by
    p.response_id,
    p.updated_at desc nulls last,
    p.id
)

select
  p.id,
  i.id as incident_id,

  coalesce(
    i.classification::text,
    public.classify_response_incident(
      coalesce(
        p.incident_nature,
        r.type_of_incident
      )
    )::text
  ) as classification,

  coalesce(
    i.priority::text,
    public.priority_from_pcr_triage(p.triage)::text,
    'medium'
  ) as priority,

  p.triage as map_severity,
  b.name as barangay_name,

  coalesce(
    i.location_text,
    r.location_text,
    r.place_of_incident,
    b.name
  ) as location_text,

  coalesce(
    i.latitude,
    r.latitude,
    extensions.st_y(b.centroid::extensions.geometry)
  ) as latitude,

  coalesce(
    i.longitude,
    r.longitude,
    extensions.st_x(b.centroid::extensions.geometry)
  ) as longitude,

  coalesce(
    i.incident_date,
    r.date_of_incident,
    p.verified_at::date,
    p.submitted_at::date,
    p.created_at::date
  ) as incident_date,

  coalesce(
    i.incident_time,
    r.time_of_incident
  ) as incident_time,

  coalesce(
    nullif(i.status::text, 'pending_admin_verification'),
    nullif(r.status::text, 'pending_admin_verification'),
    'verified'
  ) as status,

  case
    when coalesce(i.latitude, r.latitude) is null
      then 'barangay_centroid'
    else 'official_incident_pin'
  end as location_precision

from canonical p

join public.responses r
  on r.id = p.response_id
 and r.deleted_at is null

left join public.incidents i
  on i.response_id = p.response_id
 and i.deleted_at is null

left join public.barangays b
  on b.id = coalesce(
    i.barangay_id,
    r.barangay_id
  )

where (i.id is null or i.public_visible = true)
  and coalesce(
    i.latitude,
    r.latitude,
    extensions.st_y(b.centroid::extensions.geometry)
  ) is not null
  and coalesce(
    i.longitude,
    r.longitude,
    extensions.st_x(b.centroid::extensions.geometry)
  ) is not null;


-- ---------------------------------------------------------------------------
-- Safe scraper timestamp parser
--
-- Legacy scraper JSON timestamps may be malformed.
-- Never fail the entire public feed because one JSON timestamp is invalid.
-- ---------------------------------------------------------------------------

create or replace function public.public_map_event_time(value text)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog
as $$
begin
  return value::timestamptz;
exception
  when others then
    return null;
end;
$$;

revoke all
on function public.public_map_event_time(text)
from public;

grant execute
on function public.public_map_event_time(text)
to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Public scraper map projection
-- ---------------------------------------------------------------------------

create or replace view public.public_scraped_map_incidents_view
with (security_barrier = true) as

select
  s.id,
  s.related_incident_id,
  s.status,
  s.public_visible,
  s.source_site,
  s.source_url,
  s.category,
  s.incident_type,

  case

    -- Fatality
    when coalesce(
      case
        when coalesce(
          s.raw_payload->>'fatality_count',
          s.raw_payload->>'fatalityCount'
        ) ~ '^[0-9]+$'
        then coalesce(
          s.raw_payload->>'fatality_count',
          s.raw_payload->>'fatalityCount'
        )::numeric
      end,
      0
    ) > 0

    or t.body ~*
      '\m(nasawi|namatay|patay|pumanaw|binawian\s+ng\s+buhay|dead|died|dies|killed|fatalit(y|ies)|deceased)\M'

    then 'black'


    -- Severe / multiple injuries
    when coalesce(
      case
        when coalesce(
          s.raw_payload->>'injured_count',
          s.raw_payload->>'injuredCount'
        ) ~ '^[0-9]+$'
        then coalesce(
          s.raw_payload->>'injured_count',
          s.raw_payload->>'injuredCount'
        )::numeric
      end,
      0
    ) >= 5

    or t.body ~*
      '\m(malubha|kritikal|critical|serious(ly)?\s+injured|severe(ly)?\s+injured|grabeng\s+sugatan)\M'

    then 'red'


    -- Injury
    when coalesce(
      case
        when coalesce(
          s.raw_payload->>'injured_count',
          s.raw_payload->>'injuredCount'
        ) ~ '^[0-9]+$'
        then coalesce(
          s.raw_payload->>'injured_count',
          s.raw_payload->>'injuredCount'
        )::numeric
      end,
      0
    ) > 0

    or t.body ~*
      '\m(sugatan|nasugatan|injured)\M'

    then 'yellow'


    -- Minor / no injury
    when t.body ~*
      '\m(minor\s+injur(y|ies)|bahagyang\s+nasugatan|walang\s+nasugatan|no\s+injur(y|ies))\M'

    then 'green'


    -- Existing scraper severity fallback
    else
      case lower(
        coalesce(
          s.severity,
          s.raw_payload->>'severity'
        )
      )
        when 'black' then 'black'
        when 'fatal' then 'black'
        when 'fatality' then 'black'

        when 'red' then 'red'
        when 'critical' then 'red'
        when 'high' then 'red'
        when 'warning' then 'red'

        when 'green' then 'green'
        when 'low' then 'green'
        when 'minor' then 'green'

        else 'yellow'
      end

  end as severity,

  left(s.title, 160) as title,

  s.location_text,
  s.display_name,
  s.latitude,
  s.longitude,
  s.scraped_at,

  coalesce(
    s.verified_barangay,
    s.extracted_barangay,
    s.raw_payload #>> '{location,barangay}',
    b.name
  ) as verified_barangay,

  coalesce(
    s.verified_municipality,
    s.extracted_municipality,
    s.raw_payload #>> '{location,municipality}',
    b.municipality
  ) as verified_municipality,

  s.geocode_precision,
  s.mapping_status,

  jsonb_build_object(
    'level',
    s.location_confidence->>'level',
    'accuracy',
    s.location_confidence->>'accuracy',
    'source',
    s.location_confidence->>'source'
  ) as location_confidence,

  e.event_at as incident_at,

  (
    e.event_at at time zone 'Asia/Manila'
  )::date as incident_date

from public.scraper_records s

left join public.barangays b
  on b.id = s.barangay_id

cross join lateral (
  select concat_ws(
    ' ',
    s.title,
    s.snippet,
    s.raw_payload->>'title',
    s.raw_payload->>'snippet',
    s.raw_payload->>'body',
    s.raw_payload #>> '{article,title}',
    s.raw_payload #>> '{article,snippet}',
    s.raw_payload #>> '{article,body}'
  ) as body
) t

cross join lateral (
  select coalesce(
    public.public_map_event_time(
      s.raw_payload->>'incident_at'
    ),
    public.public_map_event_time(
      s.raw_payload #>> '{incident_time,incident_at}'
    ),
    public.public_map_event_time(
      s.raw_payload->>'published_at'
    ),
    public.public_map_event_time(
      s.raw_payload #>> '{article,published_at}'
    ),
    s.published_at,
    s.scraped_at
  ) as event_at
) e

where s.deleted_at is null
  and s.public_visible = true

  -- Valid scraper_record_status enum values only.
  and s.status in (
    'approved',
    'promoted',
    'matched',
    'imported'
  )

  and s.latitude is not null
  and s.longitude is not null

  and concat_ws(
    ' ',
    s.category,
    s.incident_type,
    s.title,
    s.snippet,
    s.location_text
  ) ~* '(accident|vehicular|vehicle|collision|crash|bangga|aksidente|salpok|nasagasaan|mvc)';


-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke all
on
  public.public_map_incidents_view,
  public.public_pcr_map_incidents_view,
  public.public_scraped_map_incidents_view
from public;

grant select
on
  public.public_map_incidents_view,
  public.public_pcr_map_incidents_view,
  public.public_scraped_map_incidents_view
to anon, authenticated;


-- Anonymous clients use projections only.
-- Never expose complete patient, dispatch, response, or scraper source rows.

revoke select
on
  public.incidents,
  public.scraper_records,
  public.pcr_reports,
  public.responses,
  public.dispatch_forms,
  public.dispatch_patients
from anon;


-- ---------------------------------------------------------------------------
-- PCR public-map lookup optimization
-- ---------------------------------------------------------------------------

create index if not exists
  pcr_reports_verified_response_latest_idx
on public.pcr_reports(
  response_id,
  updated_at desc,
  id
)
where deleted_at is null
  and status = 'verified';


-- ---------------------------------------------------------------------------
-- Public cache/realtime invalidation
--
-- Public subscribers receive only an empty stale signal,
-- never the changed database row.
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_public_data_stale()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin

  perform realtime.send(
    '{}'::jsonb,

    case
      when TG_TABLE_NAME = 'public_advisories'
        then 'advisory'
      else 'stale'
    end,

    'public-data-invalidations',
    false
  );

  return null;

exception
  when others then

    -- Informational broadcasting must never abort
    -- a dispatch/PCR/database write.

    raise warning
      'Public cache invalidation unavailable: %',
      SQLERRM;

    return null;
end;
$$;


revoke all
on function public.broadcast_public_data_stale()
from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Cache invalidation triggers
-- ---------------------------------------------------------------------------

create trigger public_incidents_cache_stale
after insert or update or delete
on public.incidents
for each statement
execute function public.broadcast_public_data_stale();


create trigger public_scraper_cache_stale
after insert or update or delete
on public.scraper_records
for each statement
execute function public.broadcast_public_data_stale();


create trigger public_pcr_cache_stale
after insert or update or delete
on public.pcr_reports
for each statement
execute function public.broadcast_public_data_stale();


create trigger public_hazards_cache_stale
after insert or update or delete
on public.hazard_zones
for each statement
execute function public.broadcast_public_data_stale();


create trigger public_advisories_cache_stale
after insert or update or delete
on public.public_advisories
for each statement
execute function public.broadcast_public_data_stale();


-- Reload PostgREST schema cache.
notify pgrst, 'reload schema';

commit;