-- Public GAD/MVC aggregate analytics.
--
-- This RPC is intentionally aggregate-only. It reads verified/public-safe
-- response records internally and returns counts for public charts without
-- exposing patient names, addresses, row identifiers, notes, or raw tables.

begin;

create or replace function public.get_public_gad_analytics(
  start_date date default null,
  end_date date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with canonical_pcr as materialized (
  select distinct on (p.response_id)
    p.id as pcr_id,
    p.response_id,
    p.triage,
    p.incident_nature,
    p.emergency_types,
    p.trauma_types,
    p.notes,
    p.verified_at,
    p.submitted_at,
    p.completed_at,
    p.created_at,
    p.updated_at
  from public.pcr_reports p
  where p.deleted_at is null
    and p.status = 'verified'
    and p.response_id is not null
  order by p.response_id, p.updated_at desc nulls last, p.id
),
eligible_responses as materialized (
  select
    p.pcr_id,
    p.response_id,
    coalesce(
      i.classification::text,
      public.classify_response_incident(coalesce(p.incident_nature, r.type_of_incident))::text,
      'other'
    ) as classification,
    coalesce(
      i.incident_date,
      r.date_of_incident,
      p.verified_at::date,
      p.submitted_at::date,
      p.completed_at::date,
      p.created_at::date
    ) as incident_date,
    coalesce(nullif(ib.name, ''), nullif(rb.name, ''), 'Unspecified') as barangay,
    r.patient_sex as response_patient_sex,
    r.patient_age as response_patient_age,
    public.alert_cia_safe_jsonb(p.notes)#>'{__alertCiaExtended,crash}' as crash
  from canonical_pcr p
  join public.responses r
    on r.id = p.response_id
   and r.deleted_at is null
  left join lateral (
    select i.*
    from public.incidents i
    where i.response_id = p.response_id
      and i.deleted_at is null
    order by i.public_visible desc, i.updated_at desc nulls last, i.id
    limit 1
  ) i on true
  left join public.barangays ib
    on ib.id = i.barangay_id
  left join public.barangays rb
    on rb.id = r.barangay_id
  where (i.id is null or i.public_visible = true)
    and (start_date is null or coalesce(i.incident_date, r.date_of_incident, p.verified_at::date, p.submitted_at::date, p.completed_at::date, p.created_at::date) >= start_date)
    and (end_date is null or coalesce(i.incident_date, r.date_of_incident, p.verified_at::date, p.submitted_at::date, p.completed_at::date, p.created_at::date) <= end_date)
),
dispatch_patient_rows as materialized (
  select
    e.response_id,
    e.classification,
    e.incident_date,
    e.barangay,
    dp.sex as raw_sex,
    dp.age as raw_age
  from eligible_responses e
  join public.dispatch_forms d
    on d.response_id = e.response_id
   and d.deleted_at is null
  join public.dispatch_patients dp
    on dp.dispatch_form_id = d.id
),
response_patient_rows as materialized (
  select
    e.response_id,
    e.classification,
    e.incident_date,
    e.barangay,
    e.response_patient_sex as raw_sex,
    e.response_patient_age as raw_age
  from eligible_responses e
  where not exists (
    select 1
    from public.dispatch_forms d
    join public.dispatch_patients dp
      on dp.dispatch_form_id = d.id
    where d.response_id = e.response_id
      and d.deleted_at is null
  )
),
person_rows as materialized (
  select * from dispatch_patient_rows
  union all
  select * from response_patient_rows
),
prepared as materialized (
  select
    response_id,
    classification,
    incident_date,
    barangay,
    case
      when lower(trim(coalesce(raw_sex, ''))) in ('female', 'f', 'woman', 'girl') then 'Female'
      when lower(trim(coalesce(raw_sex, ''))) in ('male', 'm', 'man', 'boy') then 'Male'
      else 'Unspecified'
    end as sex,
    case
      when raw_age between 0 and 17 then '0-17'
      when raw_age between 18 and 59 then '18-59'
      when raw_age >= 60 then '60+'
      else 'Unspecified'
    end as age_group,
    raw_sex,
    raw_age
  from person_rows
),
mvc_persons as materialized (
  select *
  from prepared
  where classification = 'mvc'
),
sex_labels(ord, name) as (
  values
    (1, 'Female'),
    (2, 'Male'),
    (3, 'Unspecified')
),
age_labels(ord, name) as (
  values
    (1, '0-17'),
    (2, '18-59'),
    (3, '60+'),
    (4, 'Unspecified')
),
completion_rows(ord, label, complete, total) as (
  select 1, 'Sex', count(*) filter (where sex <> 'Unspecified'), count(*) from mvc_persons
  union all
  select 2, 'Age', count(*) filter (where raw_age is not null), count(*) from mvc_persons
  union all
  select 3, 'Barangay', count(*) filter (where barangay <> 'Unspecified'), count(*) from mvc_persons
  union all
  select 4, 'Incident Date', count(*) filter (where incident_date is not null), count(*) from mvc_persons
),
month_series as (
  select (
    date_trunc('month', coalesce(end_date, current_date)::timestamp) - interval '11 months' + make_interval(months => month_index)
  )::date as month_start
  from generate_series(0, 11) month_index
)
select jsonb_build_object(
  'generatedAt', now(),
  'totals', jsonb_build_object(
    'verifiedPersons', (select count(*) from prepared),
    'mvcPersons', (select count(*) from mvc_persons),
    'femaleMvcPersons', (select count(*) from mvc_persons where sex = 'Female'),
    'maleMvcPersons', (select count(*) from mvc_persons where sex = 'Male'),
    'unspecifiedMvcPersons', (select count(*) from mvc_persons where sex = 'Unspecified')
  ),
  'completion', coalesce((
    select jsonb_agg(jsonb_build_object(
      'label', label,
      'complete', complete,
      'missing', greatest(total - complete, 0),
      'percent', case when total > 0 then round(100.0 * complete / total) else 0 end
    ) order by ord)
    from completion_rows
  ), '[]'::jsonb),
  'mvcBySex', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', l.name,
      'count', coalesce(c.count, 0),
      'percent', case when t.total > 0 then round(100.0 * coalesce(c.count, 0) / t.total) else 0 end
    ) order by l.ord)
    from sex_labels l
    cross join (select count(*) as total from mvc_persons) t
    left join (
      select sex, count(*) as count
      from mvc_persons
      group by sex
    ) c on c.sex = l.name
  ), '[]'::jsonb),
  'mvcByAgeGroup', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', l.name,
      'count', coalesce(c.count, 0),
      'percent', case when t.total > 0 then round(100.0 * coalesce(c.count, 0) / t.total) else 0 end
    ) order by l.ord)
    from age_labels l
    cross join (select count(*) as total from mvc_persons) t
    left join (
      select age_group, count(*) as count
      from mvc_persons
      group by age_group
    ) c on c.age_group = l.name
  ), '[]'::jsonb),
  'incidentTypeBySex', coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.total desc, row_data.name)
    from (
      select
        case classification
          when 'mvc' then 'Motor Vehicle Crash'
          when 'medical' then 'Medical'
          when 'trauma' then 'Trauma'
          when 'fire' then 'Fire'
          when 'rescue' then 'Rescue'
          else 'Other'
        end as name,
        count(*) filter (where sex = 'Female') as female,
        count(*) filter (where sex = 'Male') as male,
        count(*) filter (where sex = 'Unspecified') as unspecified,
        count(*) as total
      from prepared
      group by classification
    ) row_data
  ), '[]'::jsonb),
  'monthlyMvcBySex', coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data."monthStart")
    from (
      select
        to_char(m.month_start, 'Mon') as month,
        m.month_start as "monthStart",
        count(p.*) filter (where p.sex = 'Female') as female,
        count(p.*) filter (where p.sex = 'Male') as male,
        count(p.*) filter (where p.sex = 'Unspecified') as unspecified,
        count(p.*) as total
      from month_series m
      left join mvc_persons p
        on date_trunc('month', p.incident_date)::date = m.month_start
      group by m.month_start
    ) row_data
  ), '[]'::jsonb),
  'barangayMvcBySex', coalesce((
    select jsonb_agg(to_jsonb(row_data) order by row_data.total desc, row_data.name)
    from (
      select
        barangay as name,
        count(*) filter (where sex = 'Female') as female,
        count(*) filter (where sex = 'Male') as male,
        count(*) filter (where sex = 'Unspecified') as unspecified,
        count(*) as total
      from mvc_persons
      group by barangay
      order by total desc, name
      limit 8
    ) row_data
  ), '[]'::jsonb)
);
$$;

revoke all on function public.get_public_gad_analytics(date, date) from public;
grant execute on function public.get_public_gad_analytics(date, date) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
