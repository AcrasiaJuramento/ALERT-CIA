begin;

create or replace function public.report_token(value text) returns text
language sql immutable set search_path = pg_catalog as $$
  select regexp_replace(lower(trim(coalesce(value,''))), '[^a-z0-9]+', ' ', 'g');
$$;

create or replace function public.report_crash_value(record jsonb, keys text[]) returns text
language sql immutable set search_path = pg_catalog as $$
  select coalesce((select coalesce(record->'crash'->>key,record->>key)
    from unnest(keys) with ordinality k(key,n)
    where coalesce(trim(coalesce(record->'crash'->>key,record->>key)),'')<>'' order by n limit 1),'');
$$;

create or replace function public.report_row_matches(record jsonb, section text, label text) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare terms text; value text; engine numeric; mvc boolean;
begin
  select string_agg(public.report_token(v),' ') into terms from (
    select jsonb_array_elements_text(coalesce(record->'natureTypes','[]')) v
    union all select jsonb_array_elements_text(coalesce(record->'emergencyTypes','[]'))
    union all select jsonb_array_elements_text(coalesce(record->'traumaTypes','[]'))
    union all select record->>k from unnest(array['typeOfIncident','incidentNature','natureOfCall','otherMedical','otherTrauma','otherNature','emergencyOther','chiefComplaint']) k
  ) x;
  if section in ('Conduction','Medical','Trauma') then
    return coalesce(terms like '%'||public.report_token(label)||'%',false);
  end if;
  mvc := coalesce(terms like '%motor vehicle crash%',false)
    or coalesce(record->>'collision','') not in ('','false','0','null')
    or coalesce(record->>'selfAccident','') not in ('','false','0','null')
    or coalesce(record->>'vehicleInvolved','') not in ('','false','0','null')
    or coalesce(record#>>'{crash,vehicle}','') not in ('','false','0','null');
  if not mvc then return false; end if;
  if section='Motor Vehicle Crash' then
    value := case when label='Collision' then public.report_crash_value(record,array['collision'])
      else public.report_crash_value(record,array['selfAccident','selfAccidentStatus']) end;
    if coalesce(record->>(case when label='Collision' then 'collision' else 'selfAccident' end),'') not in ('','false','0','null') then return true; end if;
  elsif section='Vehicle Type' then
    return public.report_token(public.report_crash_value(record,array['vehicle','vehicleType','vehicleInvolved','vehicleInvolve'])) like '%'||public.report_token(label)||'%';
  elsif section='Person Involved' then
    return public.report_token(public.report_crash_value(record,array['personInvolved','person','role'])) like '%'||public.report_token(label)||'%';
  elsif section='Engine Size' then
    begin engine := nullif(regexp_replace(public.report_crash_value(record,array['engineSize','engine']),'[^0-9.]','','g'),'')::numeric;
    exception when others then engine := null; end;
    return coalesce(case when label='>4500' then engine>4500 else engine>0 and engine<4500 end,false);
  elsif section='License' then value := public.report_crash_value(record,array['license','driversLicense','driverLicense']);
  elsif section='Helmet' then value := public.report_crash_value(record,array['helmet','helmetUse']);
  elsif section='Alcohol' then value := public.report_crash_value(record,array['alcohol','alcoholBreath','alcoholInvolvement']);
  else return false; end if;
  -- Preserve the existing report's token/substring matching, including legacy symbols.
  return exists(select 1 from unnest(case when label like '%(-)%' then
    array['no','negative','none','not worn','without','unlicensed','not applicable','n a','-']
    else array['yes','positive','worn','with','licensed','license positive','+'] end) term
    where public.report_token(value) like '%'||public.report_token(term)||'%');
end; $$;

create or replace function public.report_merge_record(previous jsonb, incoming jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
  select previous || incoming || jsonb_build_object(
    'crash',coalesce(previous->'crash','{}')||coalesce(incoming->'crash','{}'),
    'natureTypes',coalesce(previous->'natureTypes','[]')||coalesce(incoming->'natureTypes','[]'),
    'emergencyTypes',coalesce(previous->'emergencyTypes','[]')||coalesce(incoming->'emergencyTypes','[]'),
    'traumaTypes',coalesce(previous->'traumaTypes','[]')||coalesce(incoming->'traumaTypes','[]'));
$$;
create aggregate public.report_merge_records(jsonb) (sfunc=public.report_merge_record, stype=jsonb, initcond='{}');

create or replace function public.get_reports_summary(period text default 'monthly') returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare result jsonb; n integer;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_dispatcher() or public.has_role('field_responder')) then
    raise exception 'Staff access required' using errcode='42501';
  end if;
  if period not in ('monthly','quarterly','annual') then raise exception 'Invalid period'; end if;
  n := case period when 'monthly' then 12 when 'quarterly' then 4 else 1 end;
  with incident_rows as materialized (
    select case when i.classification::text in ('mvc','vehicular') then 'Motor Vehicle Crash'
      else initcap(replace(i.classification::text,'_',' ')) end category,
      case period when 'annual' then 0 when 'quarterly' then (extract(month from i.incident_date)::integer-1)/3 else extract(month from i.incident_date)::integer-1 end bucket,
      b.name barangay from public.incidents i left join public.barangays b on b.id=i.barangay_id where i.deleted_at is null
  ), d as materialized (
    select d.response_id, d.id, coalesce(r.date_of_incident,d.created_at::date) date,
      coalesce(public.alert_cia_safe_jsonb(d.notes)->'__alertCiaExtended','{}') || jsonb_build_object('typeOfIncident',r.type_of_incident) record
    from public.dispatch_forms d left join public.responses r on r.id=d.response_id where d.deleted_at is null
  ), p_rows as materialized (
    select
      coalesce(p.response_id,p.dispatch_form_id,p.id) response_id,p.id,p.created_at,p.updated_at,
      coalesce(r.date_of_incident,p.submitted_at::date,p.completed_at::date,p.created_at::date) date,
      coalesce(public.alert_cia_safe_jsonb(p.notes)->'__alertCiaExtended','{}') || jsonb_build_object(
        'typeOfIncident',r.type_of_incident,'incidentNature',coalesce(nullif(p.incident_nature,''),public.alert_cia_safe_jsonb(p.notes)#>>'{__alertCiaExtended,incidentNature}',''),
        'chiefComplaint',coalesce(nullif(p.chief_complaint,''),public.alert_cia_safe_jsonb(p.notes)#>>'{__alertCiaExtended,chiefComplaint}',''),
        'emergencyTypes',case when cardinality(p.emergency_types)>0 then to_jsonb(p.emergency_types) else coalesce(public.alert_cia_safe_jsonb(p.notes)#>'{__alertCiaExtended,emergencyTypes}','[]') end,
        'traumaTypes',case when cardinality(p.trauma_types)>0 then to_jsonb(p.trauma_types) else coalesce(public.alert_cia_safe_jsonb(p.notes)#>'{__alertCiaExtended,traumaTypes}','[]') end) record
    from public.pcr_reports p left join public.responses r on r.id=p.response_id where p.deleted_at is null and p.archived_at is null
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
    select record,case period when 'annual' then 0 when 'quarterly' then (extract(month from date)::integer-1)/3 else extract(month from date)::integer-1 end bucket from merged where date is not null
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
  ), section_counts as (
    select s.ord,s.title,s.filter,l.label,l.rn,b.bucket,count(r.record) count
    from sections s cross join lateral unnest(s.labels) with ordinality l(label,rn)
    cross join generate_series(0,n-1) b(bucket)
    left join records r on r.bucket=b.bucket and public.report_row_matches(r.record,s.filter,l.label)
    group by s.ord,s.title,s.filter,l.label,l.rn,b.bucket
  ), section_rows as (
    select ord,title,filter,label,rn,jsonb_agg(count order by bucket) values,sum(count) total
    from section_counts group by ord,title,filter,label,rn
  ), section_result as (
    select ord,title,filter,jsonb_agg(jsonb_build_object('category',label,'values',values,'total',total) order by rn) rows,sum(total) total
    from section_rows group by ord,title,filter
  ), category_counts as (
    select c.category,b.bucket,count(i.category) count from (select distinct category from incident_rows) c
    cross join generate_series(0,n-1) b(bucket) left join incident_rows i on i.category=c.category and i.bucket=b.bucket group by c.category,b.bucket
  ), category_result as (
    select category,jsonb_agg(count order by bucket) values,sum(count) total from category_counts group by category
  )
  select jsonb_build_object('reportRows',coalesce((select jsonb_agg(to_jsonb(category_result) order by category) from category_result),'[]'),
    'spreadsheetRows',coalesce((select jsonb_agg(to_jsonb(section_result)-'ord' order by ord) from section_result),'[]'),
    'barangayTotals',public.analytics_distribution(coalesce((select jsonb_agg(jsonb_build_object('name',barangay)) from incident_rows where coalesce(barangay,'')<>''),'[]'),'name')) into result;
  return result;
end; $$;
revoke all on function public.get_reports_summary(text),public.report_row_matches(jsonb,text,text),public.report_crash_value(jsonb,text[]),public.report_token(text) from public,anon;
grant execute on function public.get_reports_summary(text),public.report_row_matches(jsonb,text,text),public.report_crash_value(jsonb,text[]),public.report_token(text) to authenticated;
revoke all on function public.report_merge_record(jsonb,jsonb),public.report_merge_records(jsonb) from public,anon;
grant execute on function public.report_merge_record(jsonb,jsonb),public.report_merge_records(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
