begin;

-- Invoker functions preserve the existing staff/assigned-team RLS boundary.
-- Only aggregate functions are granted; intermediate patient/notes JSON stays inside PostgreSQL.
create or replace function public.analytics_distribution(rows jsonb, field_name text, fallback text default 'Unspecified')
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n,
    'percent', round(100.0*n/nullif(total,0))) order by n desc, name), '[]')
  from (select coalesce(nullif(trim(value->>field_name), ''), fallback) name,
    count(*) n, sum(count(*)) over () total from jsonb_array_elements(rows) group by 1) g;
$$;

create or replace function public.analytics_minutes(start_time time, end_time time)
returns numeric language sql immutable set search_path = pg_catalog as $$
  select case when start_time is null or end_time is null then null
    else extract(epoch from (end_time - start_time + case when end_time < start_time then interval '1 day' else interval '0' end))/60 end;
$$;

create or replace function public.analytics_has_crash(crash jsonb, nature text, trauma text[]) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select exists(select 1 from unnest(array['selfAccident','collision','vehicle','role','alcohol','helmet','license']) key
    where coalesce(crash->>key,'') not in ('','false','0','null'))
    or coalesce(nature ilike '%vehicle%',false)
    or exists(select 1 from unnest(trauma) tag where tag ilike '%vehicle%');
$$;

create or replace function public.get_analytics_summary(start_date date default null, end_date date default null, location_scope text default 'all')
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_dispatcher() or public.has_role('field_responder')) then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  with p_base as materialized (
    select p.id, p.response_id, p.status::text, p.triage, p.incident_nature,
      p.emergency_types, p.trauma_types, p.hospital_name,
      case when public.alert_cia_safe_jsonb(p.notes)#>>'{__alertCiaExtended,waiverAccepted}'='true' then 'Refusal documented' else 'No refusal documented' end refusal,
      coalesce(nullif(p.hospital_name,''), nullif(p.endorsed_to,''), nullif(p.received_by,'')) facility,
      public.analytics_has_crash(public.alert_cia_safe_jsonb(p.notes)#>'{__alertCiaExtended,crash}',p.incident_nature,p.trauma_types) has_crash,
      public.alert_cia_safe_jsonb(p.notes)#>'{__alertCiaExtended,crash}' crash,
      coalesce(r.date_of_incident, p.submitted_at::date, p.completed_at::date, p.created_at::date) date,
      b.name barangay, b.municipality,
      r.time_of_incident, r.latitude, r.longitude
    from public.pcr_reports p left join public.responses r on r.id = p.response_id and r.deleted_at is null
    left join public.barangays b on b.id = r.barangay_id
    where p.deleted_at is null and (not public.is_admin() or p.status = 'verified')
  ), i_base as materialized (
    select i.id, i.response_id, upper(i.classification::text) classification,
      initcap(i.priority::text) priority, i.incident_date date, b.name barangay, b.municipality
    from public.incidents i left join public.barangays b on b.id = i.barangay_id
    where i.deleted_at is null and i.status::text in ('verified','completed','admin_verified','approved')
    union all
    select p.id, p.response_id,
      case when concat_ws(' ',p.incident_nature,p.trauma_types::text) ~* '(mvc|motor|vehicle|vehicular|collision|crash)'
        or p.has_crash then 'MVC'
        when p.incident_nature ilike '%medical%' or cardinality(p.emergency_types)>0 then 'MEDICAL'
        when p.incident_nature ilike '%trauma%' or cardinality(p.trauma_types)>0 then 'TRAUMA'
        else upper(coalesce(nullif(p.incident_nature,''),'Other')) end,
      case when p.triage ~* '(critical|red|emergent|immediate)' then 'Critical'
        when p.triage ~* '(urgent|high|yellow)' then 'High'
        when p.triage ~* '(minor|low|green|non-urgent)' then 'Low' else 'Medium' end,
      p.date,p.barangay,p.municipality from p_base p
    where p.status = 'verified' and not exists(select 1 from public.incidents i where i.response_id=p.response_id
      and i.deleted_at is null and i.status::text in ('verified','completed','admin_verified','approved'))
  ), d_base as materialized (
    select d.id,d.response_id,initcap(replace(d.status::text,'_',' ')) status,
      coalesce(r.date_of_incident,d.created_at::date) date,b.name barangay,b.municipality,
      coalesce(t.name,'Unassigned') team,
      public.analytics_minutes(coalesce(d.dispatch_time,r.time_of_incident),d.arrival_scene_time) response_minutes,
      public.analytics_minutes(d.arrival_scene_time,d.departure_scene_time) scene_minutes,
      public.analytics_minutes(r.time_of_incident,d.dispatch_time) caller_dispatcher,
      case when r.accepted_at >= d.sent_at then extract(epoch from (r.accepted_at-d.sent_at))/60 end dispatcher_officer,
      public.analytics_minutes((r.accepted_at at time zone 'Asia/Manila')::time,d.arrival_scene_time) acceptance_scene,
      public.analytics_minutes(d.departure_scene_time,d.arrival_hospital_time) scene_hospital,
      public.analytics_minutes(r.time_of_incident,coalesce(d.arrival_hospital_time,d.arrival_scene_time)) total_response
    from public.dispatch_forms d left join public.responses r on r.id=d.response_id and r.deleted_at is null
    left join public.barangays b on b.id=r.barangay_id left join public.responding_teams t on t.id=r.responding_team_id
    where d.deleted_at is null and (not public.is_admin() or d.status::text in ('verified','completed')
      or exists(select 1 from p_base p where p.response_id=d.response_id and p.status='verified'))
  ), i as materialized (
    select * from i_base where (start_date is null or date>=start_date) and (end_date is null or date<=end_date)
    and (location_scope='all' or (location_scope='missing' and coalesce(barangay,'')='')
      or (location_scope='echague' and municipality ilike '%echague%')
      or (location_scope='outside' and coalesce(barangay,'')<>'' and coalesce(municipality,'') not ilike '%echague%'))
  ), p as materialized (
    select * from p_base where (start_date is null or date>=start_date) and (end_date is null or date<=end_date)
    and (location_scope='all' or (location_scope='missing' and coalesce(barangay,'')='')
      or (location_scope='echague' and municipality ilike '%echague%')
      or (location_scope='outside' and coalesce(barangay,'')<>'' and coalesce(municipality,'') not ilike '%echague%'))
  ), d as materialized (
    select * from d_base where (start_date is null or date>=start_date) and (end_date is null or date<=end_date)
    and (location_scope='all' or (location_scope='missing' and coalesce(barangay,'')='')
      or (location_scope='echague' and municipality ilike '%echague%')
      or (location_scope='outside' and coalesce(barangay,'')<>'' and coalesce(municipality,'') not ilike '%echague%'))
  ), mvc as materialized (
    select i.id, p.crash from i left join lateral (select p.crash from p where p.response_id=i.response_id order by p.id limit 1) p on true where i.classification='MVC'
    union all select p.id,p.crash from p where p.has_crash
      and not exists(select 1 from i where i.response_id=p.response_id and i.classification='MVC')
  ), mvc_labels as (
    select id, k,
      case when coalesce(trim(crash->>k),'')='' then case when k='role' then 'No Role Recorded' else 'No Data' end
        when k='role' then case when crash->>k ilike '%driver%' then 'Driver' when crash->>k ilike '%passenger%' then 'Passenger' when crash->>k ilike '%pedestrian%' then 'Pedestrian' else initcap(crash->>k) end
        when lower(trim(crash->>k)) in ('positive','yes','with','licensed','wearing') then 'Yes'
        when lower(trim(crash->>k)) in ('negative','no','none','without','unlicensed') then 'No'
        when lower(crash->>k)='n/a' or crash->>k ilike '%not applicable%' then 'Not Applicable'
        else initcap(crash->>k) end name
    from mvc cross join unnest(array['role','alcohol','helmet','license']) k
  ), performance as (
    select kind, name, count(*) dispatches, sum((select count(*) from p where p.response_id=d.response_id and p.status in ('submitted','verified','completed'))) "submittedPcr",
      avg(response_minutes) "avgResponseMinutes",avg(scene_minutes) "avgSceneMinutes"
    from d cross join lateral (values ('barangay',coalesce(d.barangay,'Unspecified')),('team',d.team)) g(kind,name) group by kind,name
  )
  select jsonb_build_object(
    'totals',jsonb_build_object('incidents',(select count(*) from i),'dispatches',(select count(*) from d),'pcr',(select count(*) from p),
      'mvc',(select count(*) from mvc),'medical',(select count(*) from i where classification='MEDICAL'),'trauma',(select count(*) from i where classification='TRAUMA')),
    'byType',public.analytics_distribution(coalesce((select jsonb_agg(to_jsonb(i)) from i),'[]'),'classification'),
    'byBarangay',public.analytics_distribution(coalesce((select jsonb_agg(to_jsonb(i)) from i),'[]'),'barangay'),
    'severity',public.analytics_distribution(coalesce((select jsonb_agg(to_jsonb(i)) from i),'[]'),'priority'),
    'dispatchStatus',public.analytics_distribution(coalesce((select jsonb_agg(to_jsonb(d)) from d),'[]'),'status'),
    'pcrStatus',public.analytics_distribution(coalesce((select jsonb_agg(jsonb_build_object('status',initcap(replace(status,'_',' ')))) from p),'[]'),'status'),
    'triage',public.analytics_distribution(coalesce((select jsonb_agg(jsonb_build_object('triage',initcap(triage))) from p),'[]'),'triage','No Triage Recorded'),
    'hospitalRefusal',public.analytics_distribution(coalesce((select jsonb_agg(jsonb_build_object('refusal',refusal)) from p),'[]'),'refusal'),
    'hospitals',public.analytics_distribution(coalesce((select jsonb_agg(to_jsonb(p)) from p),'[]'),'facility','No Facility Recorded'),
    'teams',public.analytics_distribution(coalesce((select jsonb_agg(to_jsonb(d)) from d),'[]'),'team'),
    'emergencyTypes',public.analytics_distribution(coalesce((select jsonb_agg(jsonb_build_object('name',tag)) from p cross join lateral unnest(case when cardinality(emergency_types)>0 then emergency_types else array['Unspecified'] end) tag),'[]'),'name'),
    'traumaTypes',public.analytics_distribution(coalesce((select jsonb_agg(jsonb_build_object('name',tag)) from p cross join lateral unnest(trauma_types) tag),'[]'),'name'),
    'monthly', (select jsonb_agg(jsonb_build_object('month',to_char(make_date(2000,m,1),'Mon'),
      'incidents',(select count(*) from i where extract(month from date)=m),
      'dispatches',(select count(*) from d where extract(month from date)=m),
      'pcr',(select count(*) from p where extract(month from date)=m)) order by m) from generate_series(1,12) m),
    'trends',coalesce((select jsonb_agg(jsonb_build_object('month',month_key,'count',n,'previous',previous,'change',n-previous) order by month_key) from (select to_char(date_trunc('month',date),'YYYY-MM') as month_key,count(*) n,lag(count(*)) over(order by date_trunc('month',date)) previous from i group by date_trunc('month',date)) trend),'[]'),
    'responseTimes',(select jsonb_build_object('dispatchScene',avg(response_minutes),'sceneDuration',avg(scene_minutes),
      'callerDispatcher',avg(caller_dispatcher),'dispatcherOfficer',avg(dispatcher_officer),
      'acceptanceScene',avg(acceptance_scene),'sceneHospital',avg(scene_hospital),'total',avg(total_response),
      'samples',jsonb_build_object('callerDispatcher',count(caller_dispatcher),'dispatcherOfficer',count(dispatcher_officer),
        'acceptanceScene',count(acceptance_scene),'sceneHospital',count(scene_hospital),'total',count(total_response))) from d),
    'performance',coalesce((select jsonb_agg(to_jsonb(performance)-'kind' order by dispatches desc,name) from performance where kind='barangay'),'[]'),
    'teamPerformance',coalesce((select jsonb_agg(to_jsonb(performance)-'kind' order by name) from performance where kind='team'),'[]'),
    'mvc', (select jsonb_object_agg(k, public.analytics_distribution(rows,'name')) from (select k,jsonb_agg(jsonb_build_object('name',name)) rows from mvc_labels group by k) g),
    'mvcCompletion', (select jsonb_agg(jsonb_build_object('label',initcap(k),'complete',complete,'missing',missing,'percent',round(100.0*complete/nullif(complete+missing,0))))
      from (select k,count(*) filter(where name not in ('No Role Recorded','No Data')) complete,count(*) filter(where name in ('No Role Recorded','No Data')) missing from mvc_labels group by k) g)
  ) into result;
  return result;
end; $$;

revoke all on function public.get_analytics_summary(date,date,text) from public, anon;
grant execute on function public.get_analytics_summary(date,date,text) to authenticated;
revoke all on function public.analytics_distribution(jsonb,text,text), public.analytics_minutes(time,time) from public, anon;
grant execute on function public.analytics_distribution(jsonb,text,text), public.analytics_minutes(time,time) to authenticated;
revoke all on function public.analytics_has_crash(jsonb,text,text[]) from public,anon;
grant execute on function public.analytics_has_crash(jsonb,text,text[]) to authenticated;
notify pgrst,'reload schema';
commit;
