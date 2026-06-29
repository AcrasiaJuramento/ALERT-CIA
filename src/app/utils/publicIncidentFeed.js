import {
  listIncidents,
  listOfficerScrapedMapIncidents,
  listPCRMapIncidents,
} from '../services/supabase';
import { hasValidLatLng, isWithinEchagueMapArea } from './mapData';

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

export async function loadPublicAccidentIncidents({ officialLimit = 500, scrapedLimit = 200, pcrLimit = 200 } = {}) {
  const [officialSets, pcrLinked, scrapedSets] = await Promise.all([
    Promise.all([
      listIncidents({ limit: officialLimit }).catch(() => []),
    ]),
    listPCRMapIncidents({ limit: pcrLimit }).catch(() => []),
    Promise.all([
      listOfficerScrapedMapIncidents({ limit: scrapedLimit }).catch(() => []),
    ]),
  ]);

  const official = mergeMapRecords((Array.isArray(officialSets) ? officialSets : []).flat());
  const [publicScraped = [], reviewedScraped = []] = Array.isArray(scrapedSets) ? scrapedSets : [];
  const publicAndAccidentReports = official.filter(isAccidentRecord);
  const scrapedAccidents = mergeMapRecords([
    ...(Array.isArray(publicScraped) ? publicScraped : []),
    ...(Array.isArray(reviewedScraped) ? reviewedScraped : []),
  ])
    .filter(isAccidentRecord);
  const officialIds = new Set(publicAndAccidentReports.map(item => item.id));
  const pcrOnly = (Array.isArray(pcrLinked) ? pcrLinked : [])
    .filter(isAccidentRecord)
    .filter(item => !officialIds.has(item.relatedIncidentId));

  return mergeMapRecords([...publicAndAccidentReports, ...pcrOnly, ...scrapedAccidents])
    .filter(hasValidLatLng)
    .filter(isWithinEchagueMapArea)
    .map(sanitizeForPublic);
}
