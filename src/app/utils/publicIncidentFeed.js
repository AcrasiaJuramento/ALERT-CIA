import {
  listIncidents,
  listOfficerScrapedMapIncidents,
  listPublicPCRMapIncidents,
  listPublicScrapedMapIncidents,
} from '../services/supabase';

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
  records.forEach(record => {
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

export async function loadPublicAccidentIncidents({ officialLimit = 300, scrapedLimit = 200, pcrLimit = 100 } = {}) {
  const [officialSets, pcrLinked, scrapedSets] = await Promise.all([
    Promise.all([
      listIncidents({ publicOnly: true, limit: officialLimit }),
      listIncidents({ limit: officialLimit }).catch(() => []),
    ]),
    listPublicPCRMapIncidents({ limit: pcrLimit }).catch(() => []),
    Promise.all([
      listPublicScrapedMapIncidents({ limit: scrapedLimit }),
      listOfficerScrapedMapIncidents({ limit: scrapedLimit }).catch(() => []),
    ]),
  ]);

  const official = mergeMapRecords(officialSets.flat());
  const [publicScraped, reviewedScraped] = scrapedSets;
  const publicAndAccidentReports = official.filter(item => item.publicVisible || isAccidentRecord(item));
  const scrapedAccidents = mergeMapRecords([...publicScraped, ...reviewedScraped])
    .filter(item => item.publicVisible || isAccidentRecord(item));
  const officialIds = new Set(publicAndAccidentReports.map(item => item.id));
  const pcrOnly = pcrLinked.filter(item => !officialIds.has(item.relatedIncidentId));

  return mergeMapRecords([...publicAndAccidentReports, ...pcrOnly, ...scrapedAccidents]).map(sanitizeForPublic);
}
