import {
  listPublicIncidentMapRecords,
  listPublicScrapedMapIncidents,
  listPublicPCRMapIncidents,
} from '../services/supabase';
import { hasValidLatLng, isWithinIsabelaMapArea } from './mapData';
import { readPublicData, PUBLIC_TTL } from '../services/supabase/publicDataService';

function mergeMapRecords(records = []) {
  const byKey = new Map();
  const safeRecords = Array.isArray(records) ? records : [];
  safeRecords.forEach(record => {
    const key = record.relatedIncidentId || record.recordId || record.id;
    if (!key || byKey.has(key)) return;
    byKey.set(key, record);
  });
  return [...byKey.values()];
}

function sanitizeForPublic(record = {}) {
  const type = record.type || record.classification || 'incident';
  const fromScraper = String(record.sourceKind || '').includes('scraped');
  return {
    ...record,
    status: fromScraper ? 'scraped' : record.status,
    sourceLabel: record.sourceKind === 'pcr_report' ? 'Verified emergency response' : record.sourceLabel || 'Approved public report',
    assignedTeam: 'Emergency responders',
    title: record.title || `${type} alert`,
    description: record.sourceKind === 'pcr_report'
      ? 'Emergency response activity has been verified in this area. Keep distance and follow official guidance.'
      : record.description || 'Use caution near this area and consider another route if conditions are unsafe.',
  };
}

// History is intentionally paged completely for stable risk scores and route warnings.
// Marker callers pass bounds and receive one bounded page instead.
async function loadPages(loader, options, allPages) {
  if (!allPages) return loader(options);
  const rows = [];
  for (let from = 0; ; from += 500) {
    const page = await loader({ ...options, limit: 500, from });
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export function loadPublicAccidentIncidents(options = {}) {
  const { bounds = null, since, until, allPages = !bounds, ttl = PUBLIC_TTL } = options;
  const query = { bounds, ...(since !== undefined ? { since } : {}), until: until || new Date().toLocaleDateString('en-CA') };
  return readPublicData(`accident-feed:${JSON.stringify([query, allPages, ttl])}`, async () => {
    const [official, pcr, scraped] = await Promise.all([
      loadPages(listPublicIncidentMapRecords, { ...query, verifiedMapOnly: true }, allPages),
      loadPages(listPublicPCRMapIncidents, query, allPages),
      loadPages(listPublicScrapedMapIncidents, query, allPages),
    ]);
    const officialIds = new Set(official.map(item => item.id));
    return mergeMapRecords([...official, ...pcr.filter(item => !officialIds.has(item.relatedIncidentId)), ...scraped])
      .filter(hasValidLatLng).filter(isWithinIsabelaMapArea).map(sanitizeForPublic);
  }, ttl);
}

export function loadPublicIncidentLogRecords(options = {}) {
  return readPublicData(`public-log:${JSON.stringify(options)}`, async () => {
    const [official, pcr] = await Promise.all([
      loadPages(listPublicIncidentMapRecords, options, true),
      loadPages(listPublicPCRMapIncidents, options, true),
    ]);
    const ids = new Set(official.map(item => item.id));
    return mergeMapRecords([...official, ...pcr.filter(item => !ids.has(item.relatedIncidentId))])
      .filter(hasValidLatLng).filter(isWithinIsabelaMapArea).map(sanitizeForPublic);
  });
}
