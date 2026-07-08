import { ECHAGUE_CENTER, getIncidentLatLng, hasValidLatLng } from './mapData';

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
};

const riskOrder = {
  Low: 1,
  Moderate: 2,
  High: 3,
  Critical: 4,
};

export const riskStyles = {
  Low: { color: '#16a34a', label: 'Low Risk', publicLabel: 'Caution Area' },
  Moderate: { color: '#eab308', label: 'Moderate Risk', publicLabel: 'Caution Area' },
  High: { color: '#f97316', label: 'High Risk', publicLabel: 'Accident-Prone Area' },
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

function readDate(record = {}) {
  const value = record.date || record.incident_date || record.scrapedAt || record.scraped_at || record.createdAt || record.created_at;
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function readSeverity(record = {}) {
  const value = normalizeValue(record.priority || record.severity);
  if (value === 'warning') return 'high';
  if (value === 'medium') return 'moderate';
  return value || 'moderate';
}

function readIncidentType(record = {}) {
  return toTitleCase(record.classification || record.type || record.incidentType || record.category || 'Other');
}

function readSourceType(record = {}) {
  const sourceKind = normalizeValue(record.sourceKind);
  if (sourceKind.includes('scraped') || record.scraperStatus) return 'scraped';
  return 'mdrrmo';
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

function frequencyScore(count) {
  if (count >= 6) return 6;
  if (count >= 4) return 4;
  if (count >= 2) return 2;
  return 0;
}

function recencyScore(latestDate) {
  if (!latestDate) return 0;
  const ageDays = (Date.now() - latestDate.getTime()) / 86400000;
  if (ageDays <= 7) return 3;
  if (ageDays <= 30) return 2;
  if (ageDays <= 90) return 1;
  return 0;
}

function classifyRisk(score) {
  if (score >= 9) return 'Critical';
  if (score >= 6) return 'High';
  if (score >= 3) return 'Moderate';
  return 'Low';
}

function passFilters(record = {}, filters = {}) {
  const date = readDate(record);
  if (filters.startDate && (!date || date < new Date(`${filters.startDate}T00:00:00`))) return false;
  if (filters.endDate && (!date || date > new Date(`${filters.endDate}T23:59:59`))) return false;
  if (filters.incidentType && filters.incidentType !== 'all' && readIncidentType(record) !== filters.incidentType) return false;
  if (filters.severity && filters.severity !== 'all' && toTitleCase(readSeverity(record)) !== filters.severity) return false;
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
    barangays: [{ value: 'all', label: 'All' }, ...unique(record => record.barangay || record.location || 'Unspecified').map(value => ({ value, label: value }))],
    sourceTypes: [
      { value: 'all', label: 'All' },
      { value: 'mdrrmo', label: 'MDRRMO' },
      { value: 'scraped', label: 'Web Scraped' },
    ],
  };
}

export function calculateAccidentProneAreas(records = [], { publicOnly = false, filters = {} } = {}) {
  const includePending = !publicOnly;
  const grouped = new Map();

  records.forEach(record => {
    if (!passFilters(record, filters)) return;
    if (!hasValidLatLng(record)) return;

    const reliability = getRecordReliability(record, { includePending });
    if (reliability <= 0) return;
    if (publicOnly && reliability < 1) return;

    const barangay = record.barangay || record.location || 'Unspecified Area';
    const sourceType = readSourceType(record);
    const key = barangay;
    const group = grouped.get(key) || {
      barangay,
      municipality: 'Echague',
      records: [],
      latSum: 0,
      lngSum: 0,
      sourceReliabilityScore: 0,
      mdrrmoIncidentCount: 0,
      webScrapedVerifiedCount: 0,
      webScrapedPendingCount: 0,
    };
    const [lat, lng] = getIncidentLatLng(record);
    group.records.push({ ...record, sourceType, reliability });
    group.latSum += Number(lat);
    group.lngSum += Number(lng);
    group.sourceReliabilityScore += reliability;
    if (sourceType === 'mdrrmo') group.mdrrmoIncidentCount += 1;
    if (sourceType === 'scraped' && reliability >= 1) group.webScrapedVerifiedCount += 1;
    if (sourceType === 'scraped' && reliability === 0.5) group.webScrapedPendingCount += 1;
    grouped.set(key, group);
  });

  return [...grouped.values()].map((group, index) => {
    const count = group.records.length;
    const latestDate = group.records
      .map(readDate)
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null;
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
    const mostCommonIncidentType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unspecified';
    const peakTimeKey = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unspecified';
    const scores = {
      frequencyScore: frequencyScore(count),
      severityScore: highestSeverityScore,
      recencyScore: recencyScore(latestDate),
      sourceReliabilityScore: Math.min(Math.round(group.sourceReliabilityScore * 10) / 10, 4),
    };
    const totalRiskScore = scores.frequencyScore + scores.severityScore + scores.recencyScore + scores.sourceReliabilityScore;
    const riskLevel = classifyRisk(totalRiskScore);
    const isPublicVisible = ['High', 'Critical'].includes(riskLevel) && group.records.every(record => record.reliability >= 1);

    return {
      area_id: `APA-${index + 1}-${group.barangay.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      barangay: group.barangay,
      municipality: group.municipality,
      latitude: count ? group.latSum / count : ECHAGUE_CENTER[0],
      longitude: count ? group.lngSum / count : ECHAGUE_CENTER[1],
      total_incidents: count,
      mdrrmo_incident_count: group.mdrrmoIncidentCount,
      web_scraped_verified_count: group.webScrapedVerifiedCount,
      web_scraped_pending_count: group.webScrapedPendingCount,
      highest_severity: highestSeverity,
      latest_incident_date: latestDate ? latestDate.toISOString().slice(0, 10) : null,
      most_common_incident_type: mostCommonIncidentType,
      peak_time: toTitleCase(peakTimeKey),
      frequency_score: scores.frequencyScore,
      severity_score: scores.severityScore,
      recency_score: scores.recencyScore,
      source_reliability_score: scores.sourceReliabilityScore,
      total_risk_score: Math.round(totalRiskScore * 10) / 10,
      risk_level: riskLevel,
      risk_label: formatRiskLevel(riskLevel),
      is_public_visible: isPublicVisible,
      updated_at: new Date().toISOString(),
      records: publicOnly ? [] : group.records,
    };
  })
    .filter(area => !publicOnly || area.is_public_visible)
    .sort((first, second) => (riskOrder[second.risk_level] - riskOrder[first.risk_level]) || second.total_risk_score - first.total_risk_score);
}
