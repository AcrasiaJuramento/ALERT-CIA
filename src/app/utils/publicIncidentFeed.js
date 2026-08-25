import {
  listPublicIncidentMapRecords,
  listPublicScrapedMapIncidents,
  listPCRMapIncidents,
  listPublicPCRMapIncidents,
} from '../services/supabase';
import { hasValidLatLng, isWithinIsabelaMapArea } from './mapData';
import { isWithinAccidentProneWindow } from './accidentProneWindow';

const EXCLUDED_SCRAPER_STATUSES = new Set(['duplicate', 'rejected', 'ignored', 'archived', 'failed']);

function isAccidentRecord(record = {}) {
  const values = [
    record.type,
    record.classification,
    record.incidentType,
    record.category,
    record.title,
    record.description,
  ].map(value => String(value || '').toLowerCase());

  return values.some(value => (
    value.includes('accident')
    || value.includes('vehicular')
    || value.includes('vehicle')
    || value.includes('collision')
    || value.includes('crash')
    || value.includes('bangga')
    || value.includes('aksidente')
    || value.includes('salpok')
    || value.includes('nasagasaan')
    || value === 'mvc'
  ));
}

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

export async function loadPublicAccidentIncidents({ officialLimit = 500, scrapedLimit = 1000, pcrLimit = 200 } = {}) {
  const [officialSets, pcrLinked, scrapedSets] = await Promise.all([
    Promise.all([
      listPublicIncidentMapRecords({ limit: officialLimit }).catch(() => []),
    ]),
    listPublicPCRMapIncidents({ limit: pcrLimit })
      .catch(() => listPCRMapIncidents({ publicOnly: true, verifiedOnly: true, limit: pcrLimit }))
      .catch(() => []),
    Promise.all([
      listPublicScrapedMapIncidents({ limit: scrapedLimit }).catch(() => []),
    ]),
  ]);

  const official = mergeMapRecords((Array.isArray(officialSets) ? officialSets : []).flat());
  const [publicScraped = [], reviewedScraped = []] = Array.isArray(scrapedSets) ? scrapedSets : [];
  const publicAccidentReports = official.filter(isAccidentRecord);
  const scrapedAccidents = mergeMapRecords([
    ...(Array.isArray(publicScraped) ? publicScraped : []),
    ...(Array.isArray(reviewedScraped) ? reviewedScraped : []),
  ])
    .filter(record => !EXCLUDED_SCRAPER_STATUSES.has(String(record.scraperStatus || record.status || '').toLowerCase()))
    .filter(isAccidentRecord);
  const officialIds = new Set(publicAccidentReports.map(item => item.id));
  const pcrOnly = (Array.isArray(pcrLinked) ? pcrLinked : [])
    .filter(item => !officialIds.has(item.relatedIncidentId))
    .filter(isAccidentRecord);

  return mergeMapRecords([...publicAccidentReports, ...pcrOnly, ...scrapedAccidents])
    .filter(hasValidLatLng)
    .filter(isWithinIsabelaMapArea)
    .filter(record => isWithinAccidentProneWindow(
      record.date || record.incident_date || record.createdAt || record.created_at,
    ))
    .map(sanitizeForPublic);
}

export async function loadPublicIncidentLogRecords({ officialLimit = 500, pcrLimit = 200 } = {}) {
  const [officialRecords, pcrRecords] = await Promise.all([
    listPublicIncidentMapRecords({ limit: officialLimit }).catch(() => []),
    listPublicPCRMapIncidents({ limit: pcrLimit })
      .catch(() => listPCRMapIncidents({ publicOnly: true, verifiedOnly: true, limit: pcrLimit }))
      .catch(() => []),
  ]);

  const official = mergeMapRecords(officialRecords);
  const officialIds = new Set(official.map(item => item.id));
  const pcrOnly = (Array.isArray(pcrRecords) ? pcrRecords : [])
    .filter(item => !officialIds.has(item.relatedIncidentId));

  return mergeMapRecords([...official, ...pcrOnly])
    .filter(hasValidLatLng)
    .filter(isWithinIsabelaMapArea)
    .filter(record => isWithinAccidentProneWindow(
      record.date || record.incident_date || record.createdAt || record.created_at,
    ))
    .map(sanitizeForPublic);
}
