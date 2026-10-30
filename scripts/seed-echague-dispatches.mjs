// Run: node --env-file=.env scripts/seed-echague-dispatches.mjs --date=2026-10-24
// Add --dry-run to inspect the sample records without connecting to Supabase.
// Stable IDs allow retries after an interrupted run without overwriting records.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pointOnFeature from '@turf/point-on-feature';

const date = process.argv.find(arg => arg.startsWith('--date='))?.slice(7)
  ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
  throw new Error('Provide a valid --date=YYYY-MM-DD.');
}
const seedKey = `SEED-ECHAGUE-${date}`;
const note = 'SYNTHETIC TEST DATA: fictional patient and incident; approximate map pin from barangay boundary. Awaiting admin review.';
const definitions = [
  { barangay: 'San Fabian', time: '06:10', type: 'Motor Vehicle Crash', age: 28, sex: 'Male', triage: 'Yellow', complaint: 'Sample motorcycle collision with forearm pain and superficial abrasions.', trauma: ['Motor Vehicle Crash'] },
  { barangay: 'San Fabian', time: '07:40', type: 'Motor Vehicle Crash', age: 36, sex: 'Female', triage: 'Yellow', complaint: 'Sample tricycle collision with lower leg pain; patient conscious.', trauma: ['Motor Vehicle Crash'] },
  { barangay: 'Ipil', time: '09:05', type: 'Medical Emergency', age: 59, sex: 'Male', triage: 'Yellow', complaint: 'Sample dizziness and generalized weakness.', emergency: ['Medical'] },
  { barangay: 'San Manuel', time: '10:30', type: 'Fall Incident', age: 43, sex: 'Female', triage: 'Green', complaint: 'Sample slip and fall with ankle pain.', trauma: ['Fall'] },
  { barangay: 'Pag-asa', time: '12:00', type: 'Medical Emergency', age: 52, sex: 'Female', triage: 'Yellow', complaint: 'Sample shortness of breath requiring assessment and transport.', emergency: ['Medical'] },
];
const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const geojson = JSON.parse(fs.readFileSync(new URL('../src/app/data/Isabela.geojson', import.meta.url), 'utf8'));
const stableId = key => {
  const hex = createHash('sha256').update(`${seedKey}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const rows = definitions.map((row, index) => {
  const feature = geojson.features.find(f => normalize(f.properties.NAME_2) === 'echague' && normalize(f.properties.NAME_3) === normalize(row.barangay));
  if (!feature) throw new Error(`Missing boundary for ${row.barangay}.`);
  const [longitude, latitude] = pointOnFeature(feature).geometry.coordinates;
  const responseNumber = `${seedKey}-${String(index + 1).padStart(2, '0')}`;
  const timeAt = minutes => {
    const total = Number(row.time.slice(0, 2)) * 60 + Number(row.time.slice(3)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
  };
  return { ...row, longitude, latitude, responseNumber, timeAt,
    responseId: stableId(`${index}:response`), dispatchId: stableId(`${index}:dispatch`),
    patientId: stableId(`${index}:patient`), pcrId: stableId(`${index}:pcr`),
    patientName: `TEST Patient ${index + 1} (${row.barangay})`,
    address: `${row.barangay}, Echague, Isabela`,
    timestamp: minutes => `${date}T${timeAt(minutes)}+08:00`,
  };
});
if (process.argv.includes('--dry-run')) {
  console.table(rows.map(row => ({ date, response: row.responseNumber, barangay: row.barangay, type: row.type, time: row.time, latitude: row.latitude, longitude: row.longitude })));
  process.exit(0);
}
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required.');
const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function checked(query, context) {
  const { data, error } = await query;
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}
const barangays = await checked(client.from('barangays').select('id,name').eq('municipality', 'Echague'), 'Read barangays');
for (const row of rows) {
  row.barangayId = barangays.find(b => normalize(b.name) === normalize(row.barangay))?.id;
  if (!row.barangayId) throw new Error(`Missing Echague barangay: ${row.barangay}`);
}
const teams = await checked(client.from('responding_teams').select('id,name').eq('name', 'Alpha Run 1'), 'Read responding team');
const teamId = teams[0]?.id;
if (!teamId) throw new Error('Missing Alpha Run 1 responding team.');
async function insertSamples(table, payload) {
  await checked(client.from(table).upsert(payload, { onConflict: 'id', ignoreDuplicates: true }), `Seed ${table}`);
  console.log(`Ensured ${payload.length} ${table} records.`);
}
await insertSamples('responses', rows.map(row => ({
  id: row.responseId, response_number: row.responseNumber, date_of_incident: date,
  time_of_incident: row.timeAt(0), place_of_incident: row.address, location_text: row.address,
  latitude: row.latitude, longitude: row.longitude, location_geography: `POINT(${row.longitude} ${row.latitude})`,
  barangay_id: row.barangayId, type_of_incident: row.type,
  caller_name: 'TEST Caller', caller_address: row.address,
  patient_name: row.patientName, patient_age: row.age, patient_sex: row.sex, patient_address: row.address,
  initial_assessment: `${note} ${row.complaint}`, responding_team_id: teamId, accepted_by_team_id: teamId,
  status: 'pcr_completed', accepted_at: row.timestamp(5), resolved_at: row.timestamp(90), created_at: row.timestamp(0),
})));
await insertSamples('dispatch_forms', rows.map(row => ({
  id: row.dispatchId, response_id: row.responseId, dispatch_time: row.timeAt(3),
  arrival_scene_time: row.timeAt(12), departure_scene_time: row.timeAt(30),
  arrival_hospital_time: row.timeAt(48), departure_hospital_time: row.timeAt(65), arrival_office_time: row.timeAt(90),
  hospital_name: 'Echague District Hospital', number_of_patients: 1, assistance_needed: ['BRGY. OFFICIALS'],
  notes: note, status: 'pcr_completed', sent_at: row.timestamp(3), created_at: row.timestamp(0),
})));
await insertSamples('dispatch_patients', rows.map(row => ({
  id: row.patientId, dispatch_form_id: row.dispatchId, patient_order: 1,
  patient_name: row.patientName, age: row.age, sex: row.sex, address: row.address,
  assessment_findings: row.complaint, metadata: { synthetic: true, seed_key: seedKey }, created_at: row.timestamp(0),
})));
await insertSamples('pcr_reports', rows.map(row => ({
  id: row.pcrId, response_id: row.responseId, dispatch_form_id: row.dispatchId, dispatch_patient_id: row.patientId,
  responding_team_id: teamId, workflow_origin: 'normal', status: 'completed', triage: row.triage,
  chief_complaint: row.complaint, emergency_types: row.emergency || [], trauma_types: row.trauma || [],
  incident_nature: row.type, hospital_name: 'Echague District Hospital', notes: note,
  back_to_base_time: row.timeAt(90), submitted_at: row.timestamp(65), completed_at: row.timestamp(90), created_at: row.timestamp(12),
})));
await insertSamples('pcr_vital_signs', rows.map((row, index) => ({
  id: stableId(`${index}:vitals`), pcr_report_id: row.pcrId, measured_time: row.timeAt(18),
  blood_pressure: '120/80', pulse_rate: '88', respiratory_rate: '20', temperature: '36.8', oxygen_saturation: '98',
  created_at: row.timestamp(18),
})));

// Check the persisted graph, including both PCR links and each patient's parent.
const saved = await checked(client.from('pcr_reports').select(`
  id,response_id,dispatch_form_id,dispatch_patient_id,status,
  response:responses(id,response_number,date_of_incident,barangay_id,deleted_at),
  dispatch:dispatch_forms!pcr_reports_dispatch_form_id_fkey(id,response_id,deleted_at),
  patient:dispatch_patients!pcr_reports_dispatch_patient_id_fkey(id,dispatch_form_id)
`).in('id', rows.map(row => row.pcrId)), 'Verify linked records');
if (saved.length !== 5) throw new Error(`Expected 5 PCRs; found ${saved.length}.`);
for (const row of rows) {
  const pcr = saved.find(p => p.id === row.pcrId);
  if (!pcr || pcr.response_id !== row.responseId || pcr.dispatch_form_id !== row.dispatchId
    || pcr.dispatch_patient_id !== row.patientId || pcr.response?.date_of_incident !== date
    || pcr.response?.barangay_id !== row.barangayId || pcr.dispatch?.response_id !== row.responseId
    || pcr.patient?.dispatch_form_id !== row.dispatchId || pcr.response?.deleted_at || pcr.dispatch?.deleted_at) {
    throw new Error(`Link verification failed: ${row.responseNumber}`);
  }
}
console.table(saved.map(pcr => ({ response: pcr.response.response_number, date: pcr.response.date_of_incident, status: pcr.status, linked: true })));
console.log('Verified all five dispatch → patient → PCR links.');
