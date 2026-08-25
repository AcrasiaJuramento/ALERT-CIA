import { ECHAGUE_BARANGAYS, matchBarangayName } from './gisConfig';
import { CACHE_TTL, getOrSetCache } from '../utils/cache';

export const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const filterOptions = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
];

function itemsCacheKey(items = []) {
  if (!items.length) return 'empty';
  const first = items[0]?.id || items[0]?.date || 'first';
  const last = items[items.length - 1]?.id || items[items.length - 1]?.date || 'last';
  return `${items.length}:${first}:${last}`;
}

export function filterIncidentsByRange(items, range, customRange = {}) {
  const cacheKey = `analytics:filter:${itemsCacheKey(items)}:${range}:${customRange.start || ''}:${customRange.end || ''}`;
  return getOrSetCache(cacheKey, () => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (range === 'all') {
      return items;
    }

    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (range === 'week') {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'year') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'custom') {
      const customStart = customRange.start ? new Date(customRange.start) : start;
      const customEnd = customRange.end ? new Date(customRange.end) : end;
      customStart.setHours(0, 0, 0, 0);
      customEnd.setHours(23, 59, 59, 999);
      return items.filter((item) => {
        const itemDate = new Date(item.date);
        return itemDate >= customStart && itemDate <= customEnd;
      });
    }

    return items.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= start && itemDate <= end;
    });
  }, CACHE_TTL.ANALYTICS);
}

export function summarizeBy(items, keyGetter) {
  const keyName = typeof keyGetter === 'function' ? keyGetter.toString().slice(0, 80) : keyGetter;
  return getOrSetCache(`analytics:summary:${itemsCacheKey(items)}:${keyName}`, () => {
    const total = items.length || 1;
    const counts = items.reduce((acc, item) => {
      const key = typeof keyGetter === 'function' ? keyGetter(item) : item[keyGetter];
      const label = key || 'Unspecified';
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, CACHE_TTL.ANALYTICS);
}

function cleanLocationName(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isMissingLocationName(value = '') {
  const normalized = cleanLocationName(value).toLowerCase();
  return !normalized || normalized === 'unspecified' || normalized === 'no data' || normalized === 'unknown';
}

function isEchagueBarangayName(value = '', barangays = ECHAGUE_BARANGAYS) {
  if (isMissingLocationName(value)) return false;
  const matched = matchBarangayName(value, barangays);
  return barangays.includes(matched);
}

export function formatBarangayAnalyticsLabel(value = '', { outsideEchague = false } = {}) {
  const clean = cleanLocationName(value);
  if (isMissingLocationName(clean)) return 'No location data';
  return outsideEchague ? `${clean} (outside Echague)` : clean;
}

function getAnalyticsLocationName(item = {}) {
  const candidates = [
    item.barangay,
    item.verifiedBarangay,
    item.extractedBarangay,
    item.location,
    item.placeOfIncident,
    item.locationText,
    item.municipality,
    item.verifiedMunicipality,
    item.extractedMunicipality,
  ].map(cleanLocationName).filter(value => !isMissingLocationName(value));
  const barangayMatch = candidates
    .map(value => matchBarangayName(value, ECHAGUE_BARANGAYS))
    .find(value => ECHAGUE_BARANGAYS.includes(value));
  return barangayMatch || candidates[0] || '';
}

export function getBarangayStats(items, barangays = ECHAGUE_BARANGAYS) {
  return getOrSetCache(`analytics:barangay:${itemsCacheKey(items)}:${barangays.length}:outside-v2`, () => {
    const total = items.length || 1;
    const echagueRows = barangays
      .map((barangay) => {
        const barangayIncidents = items.filter((item) => matchBarangayName(getAnalyticsLocationName(item), barangays) === barangay);
        const categories = summarizeBy(barangayIncidents, 'classification');
        const priorities = summarizeBy(barangayIncidents, 'priority');
        return {
          name: barangay,
          sourceName: barangay,
          outsideEchague: false,
          count: barangayIncidents.length,
          percent: Math.round((barangayIncidents.length / total) * 100),
          trend: barangayIncidents.length >= 2 ? 'up' : barangayIncidents.length === 1 ? 'stable' : 'down',
          categories,
          priorities,
          critical: barangayIncidents.filter((item) => item.priority === 'Critical').length,
          high: barangayIncidents.filter((item) => item.priority === 'High').length,
          medium: barangayIncidents.filter((item) => item.priority === 'Medium').length,
          low: barangayIncidents.filter((item) => item.priority === 'Low').length,
          mostCommonIncidentType: categories[0]?.name || 'No incidents',
          latest: [...barangayIncidents].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 4),
        };
      });

    const outsideGroups = items.reduce((groups, item) => {
      const locationName = getAnalyticsLocationName(item);
      if (isMissingLocationName(locationName) || isEchagueBarangayName(locationName, barangays)) return groups;
      const key = cleanLocationName(locationName);
      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
      return groups;
    }, new Map());

    const outsideRows = [...outsideGroups.entries()].map(([locationName, locationIncidents]) => {
      const categories = summarizeBy(locationIncidents, 'classification');
      const priorities = summarizeBy(locationIncidents, 'priority');
      return {
        name: formatBarangayAnalyticsLabel(locationName, { outsideEchague: true }),
        sourceName: locationName,
        outsideEchague: true,
        count: locationIncidents.length,
        percent: Math.round((locationIncidents.length / total) * 100),
        trend: locationIncidents.length >= 2 ? 'up' : 'stable',
        categories,
        priorities,
        critical: locationIncidents.filter((item) => item.priority === 'Critical').length,
        high: locationIncidents.filter((item) => item.priority === 'High').length,
        medium: locationIncidents.filter((item) => item.priority === 'Medium').length,
        low: locationIncidents.filter((item) => item.priority === 'Low').length,
        mostCommonIncidentType: categories[0]?.name || 'No incidents',
        latest: [...locationIncidents].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 4),
      };
    });

    const missingIncidents = items.filter(item => isMissingLocationName(getAnalyticsLocationName(item)));
    const missingRows = missingIncidents.length ? [{
      name: 'No location data',
      sourceName: '',
      outsideEchague: false,
      missingLocation: true,
      count: missingIncidents.length,
      percent: Math.round((missingIncidents.length / total) * 100),
      trend: missingIncidents.length >= 2 ? 'up' : 'stable',
      categories: summarizeBy(missingIncidents, 'classification'),
      priorities: summarizeBy(missingIncidents, 'priority'),
      critical: missingIncidents.filter((item) => item.priority === 'Critical').length,
      high: missingIncidents.filter((item) => item.priority === 'High').length,
      medium: missingIncidents.filter((item) => item.priority === 'Medium').length,
      low: missingIncidents.filter((item) => item.priority === 'Low').length,
      mostCommonIncidentType: summarizeBy(missingIncidents, 'classification')[0]?.name || 'No incidents',
      latest: [...missingIncidents].sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)).slice(0, 4),
    }] : [];

    return [...echagueRows, ...outsideRows, ...missingRows]
      .sort((a, b) => b.count - a.count || Number(b.outsideEchague) - Number(a.outsideEchague) || a.name.localeCompare(b.name));
  }, CACHE_TTL.ANALYTICS);
}

export function totalReportRows(rows = []) {
  return rows.reduce((sum, row) => sum + row.total, 0);
}
