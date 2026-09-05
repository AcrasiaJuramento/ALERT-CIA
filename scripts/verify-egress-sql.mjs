// Isolated PostgreSQL (PGlite) contract tests. No connection to the live project.
// Pass the path to @electric-sql/pglite/dist/index.js as the first argument.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema extensions; create schema realtime;
create table realtime.test_messages(payload jsonb,event text,topic text,private boolean);
create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$ insert into realtime.test_messages values($1,$2,$3,$4) $$;
create domain extensions.geometry as text;
create function extensions.st_y(extensions.geometry) returns numeric language sql immutable as $$ select null::numeric $$;
create function extensions.st_x(extensions.geometry) returns numeric language sql immutable as $$ select null::numeric $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function public.is_admin() returns boolean language sql stable as $$ select current_setting('test.role',true)='administrator' $$;
create function public.is_dispatcher() returns boolean language sql stable as $$ select current_setting('test.role',true)='dispatcher' $$;
create function public.has_role(text) returns boolean language sql stable as $$ select current_setting('test.role',true)=$1 $$;
create function public.classify_response_incident(text) returns text language sql immutable as $$ select case when $1 ilike '%vehicle%' then 'mvc' else 'medical' end $$;
create function public.priority_from_pcr_triage(text) returns text language sql immutable as $$ select case when $1='red' then 'high' else 'medium' end $$;
create function public.alert_cia_safe_jsonb(text) returns jsonb language plpgsql immutable as $$ begin return $1::jsonb; exception when others then return '{}'::jsonb; end $$;
create table barangays(id uuid primary key,name text,municipality text,centroid extensions.geometry);
create table responding_teams(id uuid primary key,name text);
create table responses(id uuid primary key,barangay_id uuid,responding_team_id uuid,date_of_incident date,time_of_incident time,
 type_of_incident text,location_text text,place_of_incident text,latitude numeric,longitude numeric,status text,
 accepted_at timestamptz,deleted_at timestamptz);
create table incidents(id uuid primary key,response_id uuid,barangay_id uuid,classification text,priority text,title text,
 incident_date date,incident_time time,location_text text,latitude numeric,longitude numeric,status text,public_visible boolean,deleted_at timestamptz);
create table dispatch_forms(id uuid primary key,response_id uuid,dispatch_time time,arrival_scene_time time,departure_scene_time time,
 arrival_hospital_time time,sent_at timestamptz,created_at timestamptz,status text,notes text,deleted_at timestamptz);
create table dispatch_patients(id uuid);
create table pcr_reports(id uuid primary key,response_id uuid,dispatch_form_id uuid,triage text,incident_nature text,
 status text,verified_at timestamptz,submitted_at timestamptz,completed_at timestamptz,created_at timestamptz,updated_at timestamptz,
 emergency_types text[],trauma_types text[],hospital_name text,endorsed_to text,received_by text,notes text,chief_complaint text,deleted_at timestamptz,archived_at timestamptz);
create table hazard_zones(id uuid);
create table public_advisories(id uuid);
create table scraper_records(id uuid primary key,related_incident_id uuid,barangay_id uuid,status text,public_visible boolean,
 source_site text,source_url text,category text,incident_type text,incident_type_key text,severity text,title text,snippet text,
 location_text text,display_name text,latitude numeric,longitude numeric,scraped_at timestamptz,verified_barangay text,
 extracted_barangay text,verified_municipality text,extracted_municipality text,geocode_precision text,mapping_status text,
 location_confidence jsonb,raw_payload jsonb,fatality_count integer,injured_count integer,published_at timestamptz,deleted_at timestamptz);
grant usage on schema public,auth to authenticated,anon;
grant select on all tables in schema public to authenticated,anon;
select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
select set_config('test.role','administrator',false);
`);
for (const name of ['94_public_data_layer.sql','95_aggregated_analytics.sql','96_reports_aggregation.sql']) {
  try { await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')); }
  catch (error) { console.error(`Migration failed: ${name}`, error.message, error.position); throw error; }
}
const scalar = async sql => (await db.query(sql)).rows[0].value;
assert.equal(await scalar(`select get_analytics_summary()->'totals'->>'incidents' value`),'0');
assert.deepEqual(await scalar(`select get_reports_summary()->'reportRows' value`),[]);
await db.exec(`
insert into barangays values ('00000000-0000-0000-0000-000000000010','Test Barangay','Echague',null);
insert into responding_teams values ('00000000-0000-0000-0000-000000000020','Alpha Run 1');
insert into responses(id,barangay_id,responding_team_id,date_of_incident,time_of_incident,type_of_incident,latitude,longitude,accepted_at,status)
values ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020','2026-01-31','23:40','Motor Vehicle Crash',16.7,121.7,'2026-01-31 23:55+08','verified');
insert into incidents(id,response_id,barangay_id,classification,priority,incident_date,latitude,longitude,status,public_visible)
values ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','mvc','high','2026-01-31',16.7,121.7,'verified',true);
insert into dispatch_forms(id,response_id,dispatch_time,arrival_scene_time,departure_scene_time,arrival_hospital_time,sent_at,created_at,status)
values ('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000030','23:45','00:05','00:15','00:35','2026-01-31 23:50+08','2026-01-31','verified');
insert into pcr_reports(id,response_id,dispatch_form_id,triage,incident_nature,status,created_at,updated_at,notes,emergency_types,trauma_types)
values ('00000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000050','red','Motor Vehicle Crash','verified','2026-01-31','2026-01-31',
'{"__alertCiaExtended":{"crash":{"role":"Driver","vehicle":"Single Motor","helmet":"Yes","license":"No","alcohol":"No"},"natureTypes":["Conduction"]}}',array['Medical'],array['Fall']);
insert into scraper_records(id,status,public_visible,category,latitude,longitude,scraped_at,title,raw_payload)
values ('00000000-0000-0000-0000-000000000070','approved',true,'vehicular',16.7,121.7,'2026-02-01','A crash','{"incident_at":"invalid","published_at":"2026-01-31T12:00:00+08:00","secret":"never sent"}'),
('00000000-0000-0000-0000-000000000071','new',false,'vehicular',16.7,121.7,'2026-02-01','Private crash','{}');
`);
const summary = await scalar(`select get_analytics_summary() value`);
assert.deepEqual(summary.totals,{incidents:1,dispatches:1,pcr:1,mvc:1,medical:0,trauma:0});
assert.equal(summary.responseTimes.callerDispatcher,5);
assert.equal(summary.responseTimes.dispatcherOfficer,5);
assert.equal(summary.responseTimes.acceptanceScene,10);
assert.equal(summary.responseTimes.sceneHospital,20);
assert.equal(summary.responseTimes.total,55);
assert.equal(summary.byBarangay[0].count,1);
assert.equal(await scalar("select count(*)::int value from realtime.test_messages where payload <> '{}'::jsonb or private"),0);
assert.equal(summary.mvc.role[0].name,'Driver');
assert.equal(await scalar(`select get_analytics_summary('2026-02-01',null)->'totals'->>'incidents' value`),'0');
await db.exec(`
insert into pcr_reports(id,response_id,dispatch_form_id,triage,incident_nature,status,created_at,updated_at,notes,emergency_types,trauma_types)
values ('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000050','red','Motor Vehicle Crash','verified','2026-02-01','2026-02-02',
'{"__alertCiaExtended":{"crash":{"role":"Driver","vehicle":"Private Vehicle","helmet":"Yes","license":"No","alcohol":"No"},"natureTypes":["Transport"]}}',array['Pediatric'],array['Assault']);
`);
const getSection = (report, filter) => report.spreadsheetRows.find(section => section.filter === filter);
const getRow = (section, category) => section.rows.find(row => row.category === category);
for (const [period,length] of [['monthly',12],['quarterly',4],['annual',1]]) {
  const report=await scalar(`select get_reports_summary('${period}') value`);
  assert.ok(Array.isArray(report.reportRows));
  assert.ok(Array.isArray(report.spreadsheetRows));
  assert.ok(Array.isArray(report.barangayTotals));
  assert.equal(report.reportRows[0].total,1);
  assert.equal(report.reportRows[0].values.length,length);
  assert.equal(report.spreadsheetRows.every(section => section.rows.every(row => row.values.length === length)),true);
  assert.equal(getRow(getSection(report,'Person Involved'),'Driver').total,1);
  assert.equal(getRow(getSection(report,'Vehicle Type'),'Private Vehicle').total,1);
  assert.equal(getRow(getSection(report,'Vehicle Type'),'Single Motor').total,0);
  assert.equal(getRow(getSection(report,'Medical'),'Medical').total,1);
  assert.equal(getRow(getSection(report,'Medical'),'Pediatric').total,1);
  assert.equal(getRow(getSection(report,'Trauma'),'Fall').total,1);
  assert.equal(getRow(getSection(report,'Trauma'),'Assault').total,1);
}
await db.exec(`set role anon`);
assert.equal(await scalar(`select count(*)::int value from public_scraped_map_incidents_view`),1);
assert.equal(await scalar(`select incident_date::text value from public_scraped_map_incidents_view`),'2026-01-31');
assert.equal(await scalar(`select count(*)::int value from (select id, related_incident_id, status, public_visible, source_site, source_url, category, incident_type, severity, title, location_text, display_name, latitude, longitude, scraped_at, verified_barangay, verified_municipality, geocode_precision, location_confidence, mapping_status, incident_at, incident_date from public_scraped_map_incidents_view) v`),1);
assert.equal(await scalar(`select count(*)::int value from public_map_incidents_view where latitude between 16.6 and 16.8 and longitude between 121.6 and 121.8`),1);
assert.equal(await scalar(`select count(*)::int value from public_map_incidents_view where latitude between 17 and 18`),0);
const publicRow = await scalar(`select to_jsonb(v) value from public_scraped_map_incidents_view v`);
assert.ok(!JSON.stringify(publicRow).includes('secret'));
assert.ok(!('raw_payload' in publicRow));
await assert.rejects(()=>db.query(`select * from scraper_records`),/permission denied/);
await assert.rejects(()=>db.query(`select get_analytics_summary()`),/permission denied/);
await db.exec(`reset role; select set_config('test.uid','',false); set role authenticated;`);
await assert.rejects(()=>db.query(`select get_analytics_summary()`),/Staff access required/);
await db.close();
console.log('SQL contracts passed: migrations, public privacy, aggregation, period totals, date filters, MVC and midnight response segments.');
