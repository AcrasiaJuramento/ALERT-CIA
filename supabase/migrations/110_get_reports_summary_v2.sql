create or replace function public.get_reports_summary_v2(
  period text default 'monthly',
  p_year integer default extract(year from (now() at time zone 'Asia/Manila'))::integer
) returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare result jsonb; n integer; y_start date; y_end date;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_dispatcher() or public.has_role('field_responder')) then
    raise exception 'Staff access required' using errcode='42501';
  end if;
  if period not in ('monthly','quarterly','annual') then raise exception 'Invalid period'; end if;
  n := case period when 'monthly' then 12 when 'quarterly' then 4 else 1 end;

  if p_year is null then
    y_start := '-infinity'::date; y_end := 'infinity'::date;
  else
    y_start := make_date(p_year,1,1); y_end := make_date(p_year+1,1,1);
  end if;

  with incident_rows as materialized (
    select case when i.classification::text in ('mvc','vehicular') then 'Motor Vehicle Crash'
             else initcap(replace(i.classification::text,'_',' ')) end category,
           case period when 'annual' then 0
                       when 'quarterly' then (extract(month from i.incident_date)::integer-1)/3
                       else extract(month from i.incident_date)::integer-1 end bucket,
           b.name barangay
    from public.incidents i
    left join public.barangays b on b.id=i.barangay_id
    where i.deleted_at is null
      -- TODO: uncomment once you confirm incidents.status uses the value 'verified':
      -- and i.status = 'verified'
      and i.incident_date >= y_start and i.incident_date < y_end

  ), d as materialized (
    select d.response_id, d.id,
      coalesce(r.date_of_incident,(d.created_at at time zone 'Asia/Manila')::date) date,
      coalesce(nj.v->'__alertCiaExtended','{}') || jsonb_build_object('typeOfIncident',r.type_of_incident) record
    from public.dispatch_forms d
    left join public.responses r on r.id=d.response_id
    cross join lateral (select public.alert_cia_safe_jsonb(d.notes) v) nj
    where d.deleted_at is null
      and d.status in ('verified','completed')   -- both show as "Verified" in the app

  ), p_rows as materialized (
    select
      coalesce(p.response_id,p.dispatch_form_id,p.id) response_id, p.id, p.created_at, p.updated_at,
      coalesce(r.date_of_incident,
               (p.submitted_at at time zone 'Asia/Manila')::date,
               (p.completed_at at time zone 'Asia/Manila')::date,
               (p.created_at at time zone 'Asia/Manila')::date) date,
      coalesce(nj.v->'__alertCiaExtended','{}') || jsonb_build_object(
        'typeOfIncident',r.type_of_incident,
        'incidentNature',coalesce(nullif(p.incident_nature,''),nj.v#>>'{__alertCiaExtended,incidentNature}',''),
        'chiefComplaint',coalesce(nullif(p.chief_complaint,''),nj.v#>>'{__alertCiaExtended,chiefComplaint}',''),
        'emergencyTypes',case when cardinality(p.emergency_types)>0 then to_jsonb(p.emergency_types) else coalesce(nj.v#>'{__alertCiaExtended,emergencyTypes}','[]') end,
        'traumaTypes',case when cardinality(p.trauma_types)>0 then to_jsonb(p.trauma_types) else coalesce(nj.v#>'{__alertCiaExtended,traumaTypes}','[]') end) record
    from public.pcr_reports p
    left join public.responses r on r.id=p.response_id
    cross join lateral (select public.alert_cia_safe_jsonb(p.notes) v) nj
    where p.deleted_at is null and p.archived_at is null
      and p.status = 'verified'

  ), p as materialized (
    -- Same response-level merge as the original report, retaining every PCR's tags.
    select response_id, (array_agg(date order by created_at,id))[1] date,
      public.report_merge_records(record order by coalesce(updated_at,created_at),created_at,id) record
    from p_rows group by response_id

  ), merged as (
    select coalesce(p.date,d.date) date, coalesce(d.record,'{}')||coalesce(p.record,'{}')||jsonb_build_object(
      'crash',coalesce(d.record->'crash','{}')||coalesce(p.record->'crash','{}'),
      'natureTypes',coalesce(d.record->'natureTypes','[]')||coalesce(p.record->'natureTypes','[]'),
      'emergencyTypes',coalesce(d.record->'emergencyTypes','[]')||coalesce(p.record->'emergencyTypes','[]'),
      'traumaTypes',coalesce(d.record->'traumaTypes','[]')||coalesce(p.record->'traumaTypes','[]')) record
    from d full join p on p.response_id=d.response_id

  ), records as materialized (
    -- The year filter is applied here, after the merge, so a response whose dispatch and PCR dates
    -- differ is still merged exactly as before.
    select record,
      case period when 'annual' then 0
                  when 'quarterly' then (extract(month from date)::integer-1)/3
                  else extract(month from date)::integer-1 end bucket
    from merged
    where date is not null and date >= y_start and date < y_end

  ), sections(ord,title,filter,labels) as (values
    (1,'CONDUCTION','Conduction',array['Dialysis','Check-up','Travel (Within Region 2)','Travel (Outside Region 2)']),
    (2,'MEDICAL','Medical',array['Pediatric','Psychiatric','Surgical','Obstetrical','Drowning','Medical']),
    (3,'TRAUMA','Trauma',array['Fall','Electrocution','Domestic Violence','Fire Rescue Incident','Assault','Animal Bite','Trauma']),
    (4,'MOTOR VEHICLE CRASH TYPE','Motor Vehicle Crash',array['Collision','Self-Accident']),
    (5,'VEHICLE TYPE','Vehicle Type',array['Bicycle','Tricycle','Single Motor','Private Vehicle','Public Utility Vehicle','Truck','Other']),
    (6,'PERSON INVOLVED','Person Involved',array['Driver','Passenger','Pedestrian']),
    (7,'ENGINE SIZE','Engine Size',array['>4500','<4500']),
    (8,'LICENSE','License',array['License (+)','License (-)']),
    (9,'HELMET','Helmet',array['Helmet (+)','Helmet (-)']),
    (10,'ALCOHOL','Alcohol',array['Alcohol (+)','Alcohol (-)'])

  ), label_rules as (
    -- One row per label, with its token computed once.
    select s.ord, s.title, s.filter, l.label, l.rn,
           public.report_token(l.label) ltok,
           (l.label like '%(-)%') neg
    from sections s cross join lateral unnest(s.labels) with ordinality l(label,rn)

  ), tok as (
    -- Tokens for the (+)/(-) tests, computed once instead of per record.
    select (select array_agg(public.report_token(t)) from unnest(array['yes','positive','worn','with','licensed','license positive','+']) t) pos,
           (select array_agg(public.report_token(t)) from unnest(array['no','negative','none','not worn','without','unlicensed','not applicable','n a','-']) t) neg

  ), prepped as materialized (
    -- Everything report_row_matches used to recompute per label, now computed once per record.
    select r.bucket, t.terms, c.mvc, c.coll, c.self_acc,
      case when c.mvc then public.report_token(public.report_crash_value(r.record,array['collision'])) end v_coll,
      case when c.mvc then public.report_token(public.report_crash_value(r.record,array['selfAccident','selfAccidentStatus'])) end v_self,
      case when c.mvc then public.report_token(public.report_crash_value(r.record,array['vehicle','vehicleType','vehicleInvolved','vehicleInvolve'])) end v_vehicle,
      case when c.mvc then public.report_token(public.report_crash_value(r.record,array['personInvolved','person','role'])) end v_person,
      case when c.mvc then public.report_token(public.report_crash_value(r.record,array['license','driversLicense','driverLicense'])) end v_license,
      case when c.mvc then public.report_token(public.report_crash_value(r.record,array['helmet','helmetUse'])) end v_helmet,
      case when c.mvc then public.report_token(public.report_crash_value(r.record,array['alcohol','alcoholBreath','alcoholInvolvement'])) end v_alcohol,
      -- original wrapped the numeric cast in an exception block; here the cast only runs on a valid number
      case when e.raw ~ '^([0-9]+[.]?[0-9]*|[.][0-9]+)$' then e.raw::numeric end engine
    from records r
    cross join lateral (
      select string_agg(public.report_token(v),' ') terms from (
        select jsonb_array_elements_text(coalesce(r.record->'natureTypes','[]')) v
        union all select jsonb_array_elements_text(coalesce(r.record->'emergencyTypes','[]'))
        union all select jsonb_array_elements_text(coalesce(r.record->'traumaTypes','[]'))
        union all select r.record->>k from unnest(array['typeOfIncident','incidentNature','natureOfCall','otherMedical','otherTrauma','otherNature','emergencyOther','chiefComplaint']) k
      ) x
    ) t
    cross join lateral (
      select
        (coalesce(t.terms like '%motor vehicle crash%',false)
          or coalesce(r.record->>'collision','') not in ('','false','0','null')
          or coalesce(r.record->>'selfAccident','') not in ('','false','0','null')
          or coalesce(r.record->>'vehicleInvolved','') not in ('','false','0','null')
          or coalesce(r.record#>>'{crash,vehicle}','') not in ('','false','0','null')) mvc,
        (coalesce(r.record->>'collision','') not in ('','false','0','null')) coll,
        (coalesce(r.record->>'selfAccident','') not in ('','false','0','null')) self_acc
    ) c
    cross join lateral (
      select case when c.mvc then nullif(regexp_replace(public.report_crash_value(r.record,array['engineSize','engine']),'[^0-9.]','','g'),'') end raw
    ) e

  ), matches as (
    -- Same rules as report_row_matches, evaluated on the precomputed columns.
    select lr.ord, lr.rn, pr.bucket
    from prepped pr
    cross join tok
    join label_rules lr on
      case lr.filter
        when 'Conduction' then pr.terms like '%'||lr.ltok||'%'
        when 'Medical'    then pr.terms like '%'||lr.ltok||'%'
        when 'Trauma'     then pr.terms like '%'||lr.ltok||'%'
        else pr.mvc and case lr.filter
          when 'Motor Vehicle Crash' then
            case when lr.label='Collision'
              then pr.coll or exists(select 1 from unnest(tok.pos) u(t) where pr.v_coll like '%'||u.t||'%')
              else pr.self_acc or exists(select 1 from unnest(tok.pos) u(t) where pr.v_self like '%'||u.t||'%') end
          when 'Vehicle Type'     then pr.v_vehicle like '%'||lr.ltok||'%'
          when 'Person Involved'  then pr.v_person like '%'||lr.ltok||'%'
          when 'Engine Size'      then coalesce(case when lr.label='>4500' then pr.engine>4500 else pr.engine>0 and pr.engine<4500 end,false)
          when 'License' then exists(select 1 from unnest(case when lr.neg then tok.neg else tok.pos end) u(t) where pr.v_license like '%'||u.t||'%')
          when 'Helmet'  then exists(select 1 from unnest(case when lr.neg then tok.neg else tok.pos end) u(t) where pr.v_helmet like '%'||u.t||'%')
          when 'Alcohol' then exists(select 1 from unnest(case when lr.neg then tok.neg else tok.pos end) u(t) where pr.v_alcohol like '%'||u.t||'%')
          else false end
      end

  ), match_counts as (
    select ord, rn, bucket, count(*) cnt from matches group by ord, rn, bucket

  ), section_counts as (
    select lr.ord,lr.title,lr.filter,lr.label,lr.rn,b.bucket,coalesce(mc.cnt,0) cnt
    from label_rules lr
    cross join generate_series(0,n-1) b(bucket)
    left join match_counts mc on mc.ord=lr.ord and mc.rn=lr.rn and mc.bucket=b.bucket

  ), section_rows as (
    select ord,title,filter,label,rn,jsonb_agg(cnt order by bucket) as "values",sum(cnt) total
    from section_counts group by ord,title,filter,label,rn

  ), section_result as (
    select ord,title,filter,
      jsonb_agg(jsonb_build_object('category',label,'values',"values",'total',total) order by rn) as "rows",
      sum(total) total
    from section_rows group by ord,title,filter

  ), category_counts as (
    select c.category,b.bucket,count(i.category) count
    from (select distinct category from incident_rows) c
    cross join generate_series(0,n-1) b(bucket)
    left join incident_rows i on i.category=c.category and i.bucket=b.bucket
    group by c.category,b.bucket

  ), category_result as (
    select category,jsonb_agg(count order by bucket) as "values",sum(count) total
    from category_counts group by category
  )
  select jsonb_build_object(
    'reportRows', coalesce((select jsonb_agg(to_jsonb(category_result) order by category) from category_result),'[]'),
    'spreadsheetRows', coalesce((select jsonb_agg(to_jsonb(section_result)-'ord' order by ord) from section_result),'[]'),
    'barangayTotals', coalesce((
      select jsonb_agg(jsonb_build_object('name',x.barangay,'count',x.c) order by x.c desc, x.barangay)
      from (select barangay, count(*) c from incident_rows where coalesce(barangay,'')<>'' group by barangay) x
    ),'[]')
  ) into result;
  return result;
end;
$function$;

revoke all on function public.get_reports_summary_v2(text, integer) from public, anon;
grant execute on function public.get_reports_summary_v2(text, integer) to authenticated, service_role;

-- Helps the year filter on incidents. (The other tables are still read in full; see notes.)
create index if not exists idx_incidents_incident_date
  on public.incidents (incident_date) where deleted_at is null;