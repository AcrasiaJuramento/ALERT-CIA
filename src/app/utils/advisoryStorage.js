import { publicAnnouncements } from '../data/mockData';

export const ADVISORY_STORAGE_KEY = 'alert-cia-advisories';
export const ADVISORY_EVENT = 'alert-cia-advisories-updated';

const nowIso = () => new Date().toISOString();

const seedCoordinates = [
  { lat: 16.6558, lng: 121.6516 },
  { lat: 16.7154, lng: 121.6519 },
  { lat: 16.7049, lng: 121.6763 },
  { lat: 16.6616, lng: 121.6529 },
];

const getSeedCoordinate = (id) => {
  const match = String(id || '').match(/^ADV-SEED-(\d+)$/);
  if (!match) return null;
  return seedCoordinates[Number(match[1]) - 1] || null;
};

const getNormalizedCoordinates = (advisory) => {
  if (Number.isFinite(advisory.coordinates?.lat) && Number.isFinite(advisory.coordinates?.lng)) {
    return { lat: advisory.coordinates.lat, lng: advisory.coordinates.lng };
  }

  return getSeedCoordinate(advisory.id);
};

const defaultAdvisories = publicAnnouncements.map((item, index) => ({
  id: `ADV-SEED-${index + 1}`,
  title: item.title,
  message: item.message,
  severity: item.severity,
  category: item.title.toLowerCase().includes('road') ? 'road_closure' : item.title.toLowerCase().includes('flood') ? 'flood' : 'general',
  area: 'Echague, Isabela',
  coordinates: seedCoordinates[index] || null,
  status: 'published',
  createdAt: nowIso(),
  updatedAt: nowIso(),
}));

const normalizeAdvisory = (advisory) => ({
  id: advisory.id || crypto.randomUUID(),
  title: advisory.title || 'Public Advisory',
  message: advisory.message || '',
  severity: advisory.severity || 'warning',
  category: advisory.category || 'general',
  area: advisory.area || 'Echague, Isabela',
  coordinates: getNormalizedCoordinates(advisory),
  status: advisory.status || 'draft',
  createdAt: advisory.createdAt || nowIso(),
  updatedAt: advisory.updatedAt || nowIso(),
});

export function loadAdvisories() {
  try {
    const stored = JSON.parse(localStorage.getItem(ADVISORY_STORAGE_KEY) || '[]');
    return (stored.length ? stored : defaultAdvisories).map(normalizeAdvisory);
  } catch {
    return defaultAdvisories;
  }
}

export function loadPublishedAdvisories() {
  return loadAdvisories()
    .filter((advisory) => advisory.status === 'published')
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function saveAdvisory(advisory) {
  const records = loadAdvisories();
  const next = normalizeAdvisory({
    ...advisory,
    id: advisory.id || crypto.randomUUID(),
    updatedAt: nowIso(),
    createdAt: advisory.createdAt || nowIso(),
  });
  const index = records.findIndex((item) => item.id === next.id);
  if (index >= 0) records[index] = next;
  else records.unshift(next);
  localStorage.setItem(ADVISORY_STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(ADVISORY_EVENT));
  return next;
}

export function deleteAdvisory(id) {
  const records = loadAdvisories().filter((item) => item.id !== id);
  localStorage.setItem(ADVISORY_STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event(ADVISORY_EVENT));
}

export function formatAdvisoryTime(advisory) {
  const updatedAt = new Date(advisory.updatedAt || advisory.createdAt);
  if (Number.isNaN(updatedAt.getTime())) return 'Recently updated';
  const minutes = Math.max(1, Math.round((Date.now() - updatedAt.getTime()) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
