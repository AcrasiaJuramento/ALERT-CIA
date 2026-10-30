// Audit every stored news coordinate. Reports and original records stay in ignored *.local files.
// node scripts/audit-news-pins.mjs
// node scripts/audit-news-pins.mjs --apply-report=<report.local>
import fs from 'node:fs';
import path from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { getSupabaseAdminClient } from '../alert-cia-scraper/src/lib/supabase.js';
import { extractArticle } from '../alert-cia-scraper/src/lib/extractArticle.js';
import { extractLocation } from '../alert-cia-scraper/src/lib/locations.js';

const client = getSupabaseAdminClient();
const applyPath = process.argv.find(arg => arg.startsWith('--apply-report='))?.slice(15);
const norm = value => String(value || '').toLowerCase().replace(/\b(?:city|municipality|barangay|brgy|poblacion)\b/g, '').replace(/[^a-z0-9]/g, '');
async function checked(query) {
  const result = await query.abortSignal(AbortSignal.timeout(30000));
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

if (applyPath) {
  const report = JSON.parse(fs.readFileSync(applyPath, 'utf8'));
  if (report.results.length !== report.originals.length) throw new Error('Audit is incomplete; finish the scan before applying changes.');
  const results = [];
  for (const item of report.results.filter(item => item.action === 'review' && item.publicVisible)) {
    const original = report.originals.find(row => row.id === item.id);
    try {
      const current = await checked(client.from('scraper_records').select('*').eq('id', item.id).single());
      if (current.location_corrected_at || current.location_confidence?.corrected || current.location_corrected_by ||
          current.latitude !== original.latitude || current.longitude !== original.longitude ||
          current.status !== original.status || current.public_visible !== original.public_visible ||
          JSON.stringify(current.raw_payload) !== JSON.stringify(original.raw_payload)) {
        results.push({ id: item.id, outcome: 'skipped_changed_or_corrected' });
        continue;
      }
      const updated = await checked(client.from('scraper_records').update({
        public_visible: false,
        status: 'pending_review',
        needs_manual_review: true,
        error_message: `Location audit: ${item.reason}. Original coordinates retained for officer review.`,
        location_confidence: {
          ...(current.location_confidence || {}),
          incident_location_verified: false,
          audit: { checked_at: report.checkedAt, outcome: item.outcome, reason: item.reason },
        },
      }).eq('id', item.id).eq('status', current.status).eq('public_visible', current.public_visible)
        .eq('latitude', current.latitude).eq('longitude', current.longitude)
        .is('location_corrected_at', null).is('deleted_at', null)
        .select('id,status,public_visible'));
      results.push({ id: item.id, outcome: updated?.length ? 'moved_to_review' : 'skipped_changed' });
      if (results.length % 25 === 0) console.log(JSON.stringify({ applied: results.length }));
    } catch (error) {
      results.push({ id: item.id, outcome: 'error', error: error.message });
    }
  }
  const counts = results.reduce((counts, item) => ({ ...counts, [item.outcome]: (counts[item.outcome] || 0) + 1 }), {});
  const output = `${applyPath}.applied.local`;
  fs.writeFileSync(output, JSON.stringify({ appliedAt: new Date().toISOString(), counts, results }, null, 2));
  console.log(JSON.stringify({ output, counts }));
} else {
  const originals = [];
  for (let from = 0; ; from += 250) {
    const rows = await checked(client.from('scraper_records').select('*').is('deleted_at', null)
      .not('latitude', 'is', null).not('longitude', 'is', null).order('id').range(from, from + 249));
    originals.push(...rows);
    if (rows.length < 250) break;
  }
  const features = JSON.parse(fs.readFileSync(new URL('../src/app/data/Isabela.geojson', import.meta.url), 'utf8')).features;
  const checkedAt = new Date().toISOString();
  const output = path.resolve(`news-pin-audit-${checkedAt.replace(/[:.]/g, '-')}.local`);
  const report = { checkedAt, originals, results: [], counts: {} };
  fs.writeFileSync(output, JSON.stringify(report));
  console.log(JSON.stringify({ records: originals.length, report: output }));
  let cursor = 0;
  async function worker() {
    while (cursor < originals.length) {
      const row = originals[cursor++];
      const item = { id: row.id, title: row.title, url: row.source_url, publicVisible: row.public_visible,
        storedMunicipality: row.verified_municipality || row.extracted_municipality,
        storedBarangay: row.verified_barangay || row.extracted_barangay,
        action: 'none' };
      if (row.location_corrected_at || row.location_corrected_by || row.location_confidence?.corrected) {
        item.outcome = 'officer_correction_preserved';
      } else {
        let article;
        try {
          const response = await fetch(row.source_url, { signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ALERT-CIA/2.0; incident-location-audit)', Accept: 'text/html' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          article = extractArticle(await response.text(), row.source_url);
          if (!article.body || article.body.length < 80 || !article.title || /just a moment|access denied|captcha/i.test(article.title)) throw new Error('Article body unavailable');
          item.articleSource = 'live';
          item.article = article;
        } catch (error) {
          item.fetchError = error.message;
          const cached = row.raw_payload?.article || row.raw_payload || {};
          if (cached.body?.length >= 80) {
            article = { title: row.title, snippet: row.snippet, ...cached };
            item.articleSource = 'stored_body';
          }
        }
        if (!article) {
          item.outcome = 'inconclusive_fetch_failed';
        } else {
          const location = extractLocation(article.title, article.snippet, article.body);
          item.detectedLocation = location;
          if (!location?.municipality) {
            item.outcome = 'unsupported_incident_location';
            item.reason = 'Article does not establish an unambiguous Isabela incident site after excluding newsroom datelines';
          } else if (norm(location.municipality) !== norm(item.storedMunicipality)) {
            item.outcome = 'municipality_mismatch';
            item.reason = `Article indicates ${location.municipality}; stored pin indicates ${item.storedMunicipality}`;
          } else if (location.barangay && item.storedBarangay && norm(location.barangay) !== norm(item.storedBarangay)) {
            item.outcome = 'barangay_mismatch';
            item.reason = `Article indicates ${location.barangay}; stored pin indicates ${item.storedBarangay}`;
          } else {
            const area = features.filter(feature => norm(feature.properties.NAME_2) === norm(location.municipality) &&
              (!location.barangay || norm(feature.properties.NAME_3) === norm(location.barangay)));
            if (!area.length) {
              item.outcome = 'boundary_unavailable';
            } else if (!area.some(feature => booleanPointInPolygon([Number(row.longitude), Number(row.latitude)], feature))) {
              item.outcome = 'coordinate_outside_reported_area';
              item.reason = `Coordinate lies outside the reported ${location.barangay || ''} ${location.municipality} boundary`;
            } else {
              item.outcome = location.barangay ? 'supported_barangay_area' : 'supported_municipality_area';
            }
          }
          if (item.reason) item.action = 'review';
        }
      }
      report.results.push(item);
      report.counts[item.outcome] = (report.counts[item.outcome] || 0) + 1;
      if (report.results.length % 25 === 0 || report.results.length === originals.length) {
        fs.writeFileSync(output, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ checked: report.results.length, total: originals.length, counts: report.counts }));
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: output, counts: report.counts }));
}
