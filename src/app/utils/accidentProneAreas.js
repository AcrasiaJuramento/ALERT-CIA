import { ECHAGUE_CENTER, getIncidentLatLng, hasValidLatLng } from './mapData.js';
import { canUseForPointHotspot } from './locationAccuracy.js';

const VERIFIED_INCIDENT_STATUSES = new Set([
  'verified',
  'approved',
  'resolved',
  'active',
  'completed',
  'pcr_completed',
  'on_scene',
  'in_route',
  'transporting',
  'sent_to_responding_team',
  'accepted_by_responding_team',
  'pcr_in_progress',
]);

const VERIFIED_SCRAPER_STATUSES = new Set(['verified', 'approved', 'promoted', 'matched', 'imported']);
const PENDING_SCRAPER_STATUSES = new Set(['pending_review', 'new']);
const EXCLUDED_SCRAPER_STATUSES = new Set(['duplicate', 'rejected', 'ignored', 'archived', 'failed']);

const severityRank = {
  low: 0,
  moderate: 1,
  medium: 1,
  warning: 2,
  high: 2,
  critical: 3,
  black: 3,
  red: 2,
  yellow: 1,
  green: 0,
  unknown: 0,
};

const severityWeights = {
  low: 0,
  moderate: 1,
  medium: 1,
  warning: 2,
  high: 2,
  critical: 3,
  black: 3,
  red: 2,
  yellow: 1,
  green: 0,
  unknown: 0,
};

const riskOrder = {
  Low: 1,
  Caution: 2,
  Moderate: 3,
  High: 4,
  Critical: 5,
};

export const MIN_ACCIDENT_PRONE_INCIDENTS = 2;
export const ACCIDENT_ZONE_OFFICIAL = 'official_accident_prone';
export const ACCIDENT_ZONE_NEWS_CAUTION = 'news_caution_area';

export const riskStyles = {
  Low: { color: '#16a34a', label: 'Low Risk', publicLabel: 'Road Safety Monitoring Area' },
  Caution: { color: '#84cc16', label: 'Caution', publicLabel: 'Road Safety Monitoring Area' },
  Moderate: { color: '#eab308', label: 'Moderate Risk', publicLabel: 'Road Safety Monitoring Area' },
  High: { color: '#dc2626', label: 'High Risk', publicLabel: 'Accident-Prone Area' },
  Critical: { color: '#991b1b', label: 'Critical Risk', publicLabel: 'Critical Road Safety Zone' },
};

export const timeOfDayFilters = [
  { value: 'all', label: 'All' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'midnight', label: 'Midnight' },
];

export function getTimeOfDay(time = '') {
  const [hourValue] = String(time || '').split(':');
  const hour = Number(hourValue);
  if (!Number.isFinite(hour)) return 'unspecified';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'midnight';
}

export function formatRiskLevel(level) {
  return riskStyles[level]?.label || 'Low Risk';
}

function toTitleCase(value = '') {
  return String(value || 'Unspecified')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase();
}

function firstValue(record = {}, keys = []) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return null;
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function readNestedRaw(record = {}, keys = []) {
  const raw = record.rawPayload || record.raw_payload || {};
  for (const key of keys) {
    if (raw[key]) return raw[key];
  }
  if (raw.article) {
    for (const key of keys) {
      if (raw.article[key]) return raw.article[key];
    }
  }
  return null;
}

function readIncidentDateResult(record = {}) {
  const actual = firstValue(record, [
    'incidentAt', 'incident_at', 'incidentDateTime', 'incident_datetime',
    'occurredAt', 'occurred_at', 'occurrenceDate', 'occurrence_date',
    'dateOfIncident', 'date_of_incident',
  ]) || readNestedRaw(record, ['incident_at', 'incidentAt', 'occurrence_date', 'occurred_at']);
  const actualDate = validDate(actual);
  if (actualDate) return { date: actualDate, source: 'actual_incident_date' };

  const pcr = firstValue(record, ['pcrIncidentDate', 'pcr_incident_date', 'dateOfIncident', 'date_of_incident']);
  const pcrDate = validDate(pcr);
  if (pcrDate) return { date: pcrDate, source: 'pcr_incident_date' };

  const dispatch = firstValue(record, ['dispatchIncidentDate', 'dispatch_incident_date', 'incidentDate', 'incident_date', 'date']);
  const dispatchDate = validDate(dispatch);
  if (dispatchDate) return { date: dispatchDate, source: 'dispatch_incident_date' };

  const newsOccurrence = firstValue(record, ['verifiedNewsOccurrenceDate', 'verified_news_occurrence_date']);
  const newsOccurrenceDate = validDate(newsOccurrence);
  if (newsOccurrenceDate) return { date: newsOccurrenceDate, source: 'verified_news_occurrence_date' };

  const verifiedNews = getRecordReliability(record) >= 1
    ? firstValue(record, ['publishedAt', 'published_at']) || readNestedRaw(record, ['published_at', 'publishedAt'])
    : null;
  const verifiedNewsDate = validDate(verifiedNews);
  if (verifiedNewsDate) return { date: verifiedNewsDate, source: 'verified_news_publication_date' };

  return { date: null, source: null, reason: 'missing_incident_date' };
}

export function readIncidentDate(record = {}) {
  return readIncidentDateResult(record).date;
}

function readDate(record = {}) {
  return readIncidentDate(record);
}

function readSeverity(record = {}) {
  const value = normalizeValue(record.triage || record.priority || record.severity);
  if (value === 'black') return 'critical';
  if (value === 'red') return 'high';
  if (value === 'yellow') return 'moderate';
  if (value === 'green') return 'low';
  if (value === 'warning') return 'high';
  if (value === 'medium') return 'moderate';
  return value || 'unknown';
}

function recordRiskSort(left = {}, right = {}) {
  const leftSeverity = severityRank[readSeverity(left)] ?? 1;
  const rightSeverity = severityRank[readSeverity(right)] ?? 1;
  if (leftSeverity !== rightSeverity) return rightSeverity - leftSeverity;
  const leftDate = readDate(left)?.getTime() || 0;
  const rightDate = readDate(right)?.getTime() || 0;
  return rightDate - leftDate;
}

function readIncidentType(record = {}) {
  return toTitleCase(record.classification || record.type || record.incidentType || record.category || 'Other');
}

function isMvcRecord(record = {}) {
  const values = [
    record.classification,
    record.type,
    record.incidentType,
    record.incident_type,
    record.incidentTypeKey,
    record.incident_type_key,
    record.category,
    record.incidentNature,
    record.incident_nature,
    record.subtype,
    record.title,
    record.description,
    record.snippet,
    ...(record.emergencyTypes || []),
    ...(record.traumaTypes || []),
  ].map(value => normalizeValue(value)).join(' ');

  return /\b(?:mvc|vehicular|vehicle|motorcycle|tricycle|collision|crash|road\s+accident|traffic\s+accident|aksidente|bangga|salpukan|nasagasaan)\b/.test(values);
}

function readMunicipality(record = {}) {
  return record.municipality || record.verifiedMunicipality || record.extractedMunicipality || 'Unspecified';
}

function readSourceType(record = {}) {
  const sourceKind = normalizeValue(record.sourceKind);
  if (sourceKind.includes('scraped') || record.scraperStatus) return 'scraped';
  return 'mdrrmo';
}

function isPcrDispatchRecord(record = {}) {
  const sourceKind = normalizeValue(record.sourceKind || record.source_type);
  return sourceKind === 'pcr_report'
    || sourceKind === 'dispatch'
    || sourceKind === 'response'
    || Boolean(
      record.sourcePcrId || record.source_pcr_id || record.pcrId || record.pcr_id
      || record.responseId || record.response_id || record.dispatchResponseId || record.dispatch_response_id
      || record.dispatchId || record.dispatch_id,
    );
}

function readReviewStatus(record = {}) {
  return normalizeValue(record.scraperStatus || record.status);
}

function isDraft(record = {}) {
  return normalizeValue(record.status) === 'draft';
}

function getRecordReliability(record = {}, { includePending = false } = {}) {
  const sourceType = readSourceType(record);
  if (sourceType === 'mdrrmo') {
    return !isDraft(record) && VERIFIED_INCIDENT_STATUSES.has(normalizeValue(record.status)) ? 2 : 0;
  }

  const reviewStatus = readReviewStatus(record);
  if (EXCLUDED_SCRAPER_STATUSES.has(reviewStatus)) return 0;
  if (VERIFIED_SCRAPER_STATUSES.has(reviewStatus) || record.publicVisible) return 1;
  if (includePending && PENDING_SCRAPER_STATUSES.has(reviewStatus)) return 0.5;
  return 0;
}

export function getCanonicalIncidentKey(record = {}) {
  const sourceType = readSourceType(record);
  const officialRelationships = sourceType === 'mdrrmo' && isPcrDispatchRecord(record)
    ? [
      ['official_incident', record.relatedIncidentId || record.related_incident_id || record.incidentId || record.incident_id || record.officialIncidentId || record.official_incident_id],
      ['pcr', record.sourcePcrId || record.source_pcr_id || record.pcrId || record.pcr_id],
      ['response', record.responseId || record.response_id || record.dispatchResponseId || record.dispatch_response_id],
      ['dispatch', record.dispatchId || record.dispatch_id],
    ]
    : [];
  const scrapedRelationships = sourceType === 'scraped'
    ? [
      ['scraped_incident', record.scrapedIncidentId || record.scraped_incident_id],
      ['duplicate', record.duplicateKey || record.duplicate_key],
    ]
    : [];
  const relationships = [...officialRelationships, ...scrapedRelationships];
  const match = relationships.find(([, value]) => value !== undefined && value !== null && value !== '');
  if (match) return `${match[0]}:${String(match[1])}`;
  const fallback = record.id || record.recordId || record.record_id || record.scraperRecordId || record.scraper_record_id || record.sourceUrl || record.source_url;
  return fallback ? `record:${String(fallback)}` : null;
}

function monthsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  return Math.max(0, ((endDate.getFullYear() - startDate.getFullYear()) * 12) + endDate.getMonth() - startDate.getMonth() + 1);
}

function formatLocalDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function classifyRecommendedRisk({
  uniqueIncidentCount,
  severityBurden,
}) {
  const count = uniqueIncidentCount;

  if (count <= 0) return 'Low';
  if (count === 1) return 'Caution';
  if (count === 2) return 'Moderate';

  if (count >= 5 && severityBurden >= 12) {
    return 'Critical';
  }

  if (
    count >= 5 ||
    (count >= 3 && severityBurden >= 6)
  ) {
    return 'High';
  }

  return 'Moderate';
}

function recentAdvisory(records = [], now = new Date()) {
  const newestBySeverity = records
    .map(record => ({ date: readIncidentDate(record), severity: readSeverity(record) }))
    .filter(item => item.date);
  const hasWithin = (days, severities = null) => newestBySeverity.some(item => {
    const ageDays = (now.getTime() - item.date.getTime()) / 86400000;
    return ageDays >= 0 && ageDays <= days && (!severities || severities.has(item.severity));
  });

  if (hasWithin(7, new Set(['critical']))) return 'Immediate Review';
  if (hasWithin(30, new Set(['high', 'critical']))) return 'Recent Serious Incident';
  if (hasWithin(90)) return 'Active Monitoring';
  return null;
}

function preciseLocationRatio(records = []) {
  if (!records.length) return 0;
  const precise = records.filter(record => canUseForPointHotspot(record)).length;
  return precise / records.length;
}

function evidenceConfidence(records = [], diagnostics = []) {
  const unresolvedDuplicates = diagnostics.some(item => item.reason === 'unresolved_duplicate_relationship');
  const allVerified = records.length > 0 && records.every(record => getRecordReliability(record) >= 1);
  const allOfficialOrVerified = records.length > 0 && records.every(record => readSourceType(record) === 'mdrrmo' || getRecordReliability(record) >= 1);
  const preciseRatio = preciseLocationRatio(records);
  const missingFields = diagnostics.some(item => item.reason === 'missing_incident_date');
  const reasons = [];

  if (!allVerified) reasons.push('Some records are unverified or pending review.');
  if (unresolvedDuplicates) reasons.push('Some records do not have verified duplicate/link relationships.');
  if (preciseRatio < 0.5) reasons.push('Most locations are barangay-level or approximate.');
  if (missingFields) reasons.push('Some otherwise relevant records are missing incident dates.');

  if (allOfficialOrVerified && !unresolvedDuplicates && preciseRatio >= 0.8) {
    return { level: 'High', reasons: ['All eligible incidents are official or verified, duplicate links are resolved, and at least 80% have precise locations.'] };
  }
  if (allVerified && !unresolvedDuplicates && preciseRatio >= 0.5) {
    return { level: 'Moderate', reasons: ['All eligible incidents are verified, duplicate links are resolved, and at least 50% have precise locations.'] };
  }
  return { level: 'Low', reasons: reasons.length ? reasons : ['Evidence is limited or incomplete.'] };
}

function passFilters(record = {}, filters = {}) {
  const date = readDate(record);
  if (filters.startDate && (!date || date < new Date(`${filters.startDate}T00:00:00`))) return false;
  if (filters.endDate && (!date || date > new Date(`${filters.endDate}T23:59:59`))) return false;
  if (filters.incidentType && filters.incidentType !== 'all' && readIncidentType(record) !== filters.incidentType) return false;
  if (filters.severity && filters.severity !== 'all' && toTitleCase(readSeverity(record)) !== filters.severity) return false;
  if (filters.municipality && filters.municipality !== 'all' && readMunicipality(record) !== filters.municipality) return false;
  if (filters.barangay && filters.barangay !== 'all' && (record.barangay || record.location || 'Unspecified') !== filters.barangay) return false;
  if (filters.sourceType && filters.sourceType !== 'all' && readSourceType(record) !== filters.sourceType) return false;
  if (filters.timeOfDay && filters.timeOfDay !== 'all' && getTimeOfDay(record.time) !== filters.timeOfDay) return false;
  return true;
}

export function getAccidentProneFilterOptions(records = []) {
  const safeRecords = records.filter(record => getRecordReliability(record, { includePending: true }) > 0);
  const unique = getter => [...new Set(safeRecords.map(getter).filter(Boolean))].sort();
  return {
    incidentTypes: [{ value: 'all', label: 'All' }, ...unique(readIncidentType).map(value => ({ value, label: value }))],
    severities: [{ value: 'all', label: 'All' }, ...unique(record => toTitleCase(readSeverity(record))).map(value => ({ value, label: value }))],
    municipalities: [{ value: 'all', label: 'All' }, ...unique(readMunicipality).map(value => ({ value, label: value }))],
    barangays: [{ value: 'all', label: 'All' }, ...unique(record => record.barangay || record.location || 'Unspecified').map(value => ({ value, label: value }))],
    sourceTypes: [
      { value: 'all', label: 'All' },
      { value: 'mdrrmo', label: 'MDRRMO' },
      { value: 'scraped', label: 'Web Scraped' },
    ],
  };
}

function passSourceMode(record = {}, sourceMode = 'all') {
  const sourceType = readSourceType(record);
  if (sourceMode === 'official') return sourceType === 'mdrrmo' && isPcrDispatchRecord(record);
  if (sourceMode === 'scraped') return sourceType === 'scraped';
  return true;
}

function zoneTypeForSourceMode(sourceMode = 'all') {
  if (sourceMode === 'official') return ACCIDENT_ZONE_OFFICIAL;
  if (sourceMode === 'scraped') return ACCIDENT_ZONE_NEWS_CAUTION;
  return 'combined_accident_pattern';
}

export function calculateAccidentProneAreas(records = [], {
  publicOnly = false,
  filters = {},
  groupBy = 'barangay',
  sourceMode = 'all',
} = {}) {
  const includePending = !publicOnly;
  const grouped = new Map();
  const seenRecords = new Set();
  const groupByMunicipality = groupBy === 'municipality';
  const analysisWindowEnd = new Date();
  const analysisWindowStart = new Date(analysisWindowEnd);
  analysisWindowStart.setMonth(analysisWindowStart.getMonth() - 36);

  records.forEach(record => {
    if (!isMvcRecord(record)) return;
    if (!passFilters(record, filters)) return;
    if (!passSourceMode(record, sourceMode)) return;
    if (!hasValidLatLng(record)) return;

    const reliability = getRecordReliability(record, { includePending });
    if (reliability <= 0) return;
    if (publicOnly && reliability < 1) return;

    const canonicalKey = getCanonicalIncidentKey(record);
    const hasReliableRelationship = canonicalKey && !canonicalKey.startsWith('record:');
    if (canonicalKey) {
      if (seenRecords.has(canonicalKey)) return;
      seenRecords.add(canonicalKey);
    }

    const barangay = record.barangay || record.location || 'Unspecified Area';
    const municipality = readMunicipality(record);
    const areaName = groupByMunicipality ? municipality : barangay;
    const sourceType = readSourceType(record);
    const incidentDateResult = readIncidentDateResult(record);
    const inAnalysisWindow = incidentDateResult.date && incidentDateResult.date >= analysisWindowStart && incidentDateResult.date <= analysisWindowEnd;
    const key = groupByMunicipality ? `municipality:${municipality}` : `barangay:${municipality}:${barangay}`;
    const group = grouped.get(key) || {
      barangay: areaName,
      area_label: areaName,
      group_by: groupByMunicipality ? 'municipality' : 'barangay',
      municipality,
      records: [],
      eligibleRecords: [],
      diagnostics: [],
      latSum: 0,
      lngSum: 0,
      pointLatSum: 0,
      pointLngSum: 0,
      pointEligibleCount: 0,
      pointEligibleRecords: [],
      barangayOnlyScrapedCount: 0,
      sourceReliabilityScore: 0,
      mdrrmoIncidentCount: 0,
      webScrapedVerifiedCount: 0,
      webScrapedPendingCount: 0,
    };
    const [lat, lng] = getIncidentLatLng(record);
    const normalizedRecord = {
      ...record,
      sourceType,
      reliability,
      canonicalIncidentKey: canonicalKey,
      incidentDateSource: incidentDateResult.source,
    };
    group.records.push(normalizedRecord);
    if (!incidentDateResult.date) {
      group.diagnostics.push({
        record_id: record.id || record.recordId || record.record_id || null,
        canonical_incident_key: canonicalKey,
        reason: incidentDateResult.reason || 'missing_incident_date',
      });
    } else if (!inAnalysisWindow) {
      group.diagnostics.push({
        record_id: record.id || record.recordId || record.record_id || null,
        canonical_incident_key: canonicalKey,
        reason: 'outside_36_month_window',
        incident_date: formatLocalDate(incidentDateResult.date),
      });
    } else {
      group.eligibleRecords.push(normalizedRecord);
    }
    if (!hasReliableRelationship && sourceType === 'scraped') {
      group.diagnostics.push({
        record_id: record.id || record.recordId || record.record_id || null,
        canonical_incident_key: canonicalKey,
        reason: 'unresolved_duplicate_relationship',
      });
    }
    group.latSum += Number(lat);
    group.lngSum += Number(lng);
    if (canUseForPointHotspot(record)) {
      group.pointLatSum += Number(lat);
      group.pointLngSum += Number(lng);
      group.pointEligibleCount += 1;
      group.pointEligibleRecords.push(record);
    } else if (sourceType === 'scraped') {
      group.barangayOnlyScrapedCount += 1;
    }
    group.sourceReliabilityScore += reliability;
    if (sourceType === 'mdrrmo') group.mdrrmoIncidentCount += 1;
    if (sourceType === 'scraped' && reliability >= 1) group.webScrapedVerifiedCount += 1;
    if (sourceType === 'scraped' && reliability === 0.5) group.webScrapedPendingCount += 1;
    grouped.set(key, group);
  });

  return [...grouped.values()]
    .filter(group => group.records.length >= MIN_ACCIDENT_PRONE_INCIDENTS || group.eligibleRecords.length > 0)
    .map((group, index) => {
    const count = group.records.length;
    const uniqueIncidentCount = group.eligibleRecords.length;
    const latestDate = group.records
      .map(readDate)
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null;
    const eligibleDates = group.eligibleRecords.map(readIncidentDate).filter(Boolean).sort((a, b) => a - b);
    const availableDataMonths = eligibleDates.length ? Math.min(36, monthsBetween(eligibleDates[0], analysisWindowEnd)) : 0;
    const highestSeverityScore = Math.max(...group.records.map(record => severityRank[readSeverity(record)] ?? 1), 0);
    const highestSeverity = Object.entries(severityRank)
      .filter(([, score]) => score === highestSeverityScore)
      .map(([name]) => toTitleCase(name))[0] || 'Low';
    const typeCounts = group.records.reduce((acc, record) => {
      const type = readIncidentType(record);
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    const timeCounts = group.records.reduce((acc, record) => {
      const period = getTimeOfDay(record.time);
      acc[period] = (acc[period] || 0) + 1;
      return acc;
    }, {});
    const severityCounts = group.eligibleRecords.reduce((acc, record) => {
      const severity = readSeverity(record);
      if (severity === 'critical') acc.critical += 1;
      else if (severity === 'high') acc.high += 1;
      else if (severity === 'moderate') acc.moderate += 1;
      else if (severity === 'low') acc.low += 1;
      else acc.unknown += 1;
      return acc;
    }, { low: 0, moderate: 0, high: 0, critical: 0, unknown: 0 });
    const severityBurden = group.eligibleRecords.reduce((sum, record) => sum + (severityWeights[readSeverity(record)] ?? severityWeights.unknown), 0);
    const recommendedRiskLevel = classifyRecommendedRisk({
      uniqueIncidentCount,
      severityBurden,
    });
    const confidence = evidenceConfidence(group.eligibleRecords, group.diagnostics);
    const mostCommonIncidentType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unspecified';
    const peakTimeKey = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unspecified';
    const pointHotspotEligible = group.pointEligibleCount > 0;
    const representativePointRecord = [...group.pointEligibleRecords].sort(recordRiskSort)[0];
    const representativePoint = representativePointRecord ? getIncidentLatLng(representativePointRecord) : null;
    const zoneType = zoneTypeForSourceMode(sourceMode);
    const allPublicVerified = group.records.every(record => record.reliability >= 1);
    const isPublicVisible = pointHotspotEligible
      && allPublicVerified
      && (zoneType === ACCIDENT_ZONE_NEWS_CAUTION
        ? uniqueIncidentCount > 0
        : ['High', 'Critical'].includes(recommendedRiskLevel));
    const areaPrefix = sourceMode === 'official' ? 'APA' : sourceMode === 'scraped' ? 'NCA' : 'APA';

    return {
      area_id: `${areaPrefix}-${index + 1}-${group.barangay.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      zone_type: zoneType,
      zone_label: zoneType === ACCIDENT_ZONE_NEWS_CAUTION ? 'News-Based Caution Area' : 'Accident-Prone Area',
      barangay: group.barangay,
      municipality: group.municipality,
      latitude: representativePoint ? representativePoint[0] : count ? group.latSum / count : ECHAGUE_CENTER[0],
      longitude: representativePoint ? representativePoint[1] : count ? group.lngSum / count : ECHAGUE_CENTER[1],
      total_incidents: count,
      unique_incident_count: uniqueIncidentCount,
      point_hotspot_eligible: pointHotspotEligible,
      barangay_only_scraped_count: group.barangayOnlyScrapedCount,
      mdrrmo_incident_count: group.mdrrmoIncidentCount,
      web_scraped_verified_count: group.webScrapedVerifiedCount,
      web_scraped_pending_count: group.webScrapedPendingCount,
      highest_severity: highestSeverity,
      latest_incident_date: latestDate ? latestDate.toISOString().slice(0, 10) : null,
      analysis_window_start: formatLocalDate(analysisWindowStart),
      analysis_window_end: formatLocalDate(analysisWindowEnd),
      available_data_months: availableDataMonths,
      is_provisional: availableDataMonths < 36,
      provisional_message: availableDataMonths < 36 ? `Provisional classification based on ${availableDataMonths} months of available incident data.` : null,
      most_common_incident_type: mostCommonIncidentType,
      peak_time: toTitleCase(peakTimeKey),
      risk_level: recommendedRiskLevel,
      risk_label: formatRiskLevel(recommendedRiskLevel),
      recommended_risk_level: recommendedRiskLevel,
      recommended_risk_label: riskStyles[recommendedRiskLevel]?.label || recommendedRiskLevel,
      severity_burden: severityBurden,
      severity_counts: severityCounts,
      recent_advisory: recentAdvisory(group.eligibleRecords, analysisWindowEnd),
      evidence_confidence: confidence.level,
      evidence_confidence_reasons: confidence.reasons,
      is_public_visible: isPublicVisible,
      updated_at: new Date().toISOString(),
      diagnostics: group.diagnostics,
      records: publicOnly ? [] : group.records,
    };
  })
    .filter(area => !publicOnly || area.is_public_visible)
    .sort((first, second) => (riskOrder[second.risk_level] - riskOrder[first.risk_level]) || second.severity_burden - first.severity_burden || second.unique_incident_count - first.unique_incident_count);
}

export function calculateOfficialAccidentProneAreas(records = [], options = {}) {
  return calculateAccidentProneAreas(records, { ...options, sourceMode: 'official' });
}

export function calculateNewsCautionAreas(records = [], options = {}) {
  return calculateAccidentProneAreas(records, { ...options, sourceMode: 'scraped' });
}
