import pointOnFeature from '@turf/point-on-feature';
import { booleanPointInPolygon, point as turfPoint } from '@turf/turf';
import { ECHAGUE_GIS, getFeatureBarangayName, matchBarangayName } from './gisConfig';
import echagueGeoJsonUrl from './echague_barangays.geojson?url';
import isabelaGeoJsonUrl from './Isabela.geojson?url';
import { ISABELA_MUNICIPALITIES } from './isabelaMunicipalities';

let boundaryIndexPromise;
let boundaryCollectionPromise;
let echagueBoundaryCollectionPromise;
let municipalityIndexPromise;

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\bgeneral\b/g, 'gen')
    .replace(/\bsanta\b/g, 'sta')
    .replace(/\bsanto\b/g, 'sto')
    .replace(/\b(?:1|i|one|uno)\b/g, '1')
    .replace(/\b(?:2|ii|two|dos)\b/g, '2')
    .replace(/\b(?:3|iii|three|tres)\b/g, '3')
    .replace(/\b(?:4|iv|four|kwatro|cuatro)\b/g, '4')
    .replace(/\b(?:5|v|five|singko|cinco)\b/g, '5')
    .replace(/\b(?:city|municipality|barangay|brgy|bgy|baryo|poblacion)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function locationKey(barangay, municipality) {
  return `${normalizeName(municipality)}|${normalizeName(barangay)}`;
}

function canonicalMunicipalityName(value = '') {
  const normalized = normalizeName(value);
  return ISABELA_MUNICIPALITIES.find((municipality) => normalizeName(municipality) === normalized) || value;
}

const MAP_LABEL_LOCATION_OVERRIDES = [
  {
    barangay: 'Buena Suerte',
    municipality: 'Cauayan',
    province: 'Isabela',
    source: 'map_label_override',
    reason: 'The local map label for the Buena Suerte settlement falls just outside the province-wide barangay polygon.',
    bounds: {
      minLat: 16.921,
      maxLat: 16.931,
      minLng: 121.786,
      maxLng: 121.802,
    },
    replaces: [
      { barangay: 'Labinab', municipality: 'Cauayan' },
      { barangay: 'Labinab', municipality: 'Cauayan City' },
    ],
  },
];

function locationOverrideForPoint(latitude, longitude, location = {}) {
  return MAP_LABEL_LOCATION_OVERRIDES.find((override) => {
    const { bounds } = override;
    if (
      latitude < bounds.minLat ||
      latitude > bounds.maxLat ||
      longitude < bounds.minLng ||
      longitude > bounds.maxLng
    ) {
      return false;
    }
    if (!override.replaces?.length) return true;
    return override.replaces.some((candidate) => (
      normalizeName(candidate.barangay) === normalizeName(location.barangay) &&
      normalizeName(candidate.municipality) === normalizeName(location.municipality)
    ));
  }) || null;
}

export async function loadIsabelaBoundaryCollection() {
  if (!boundaryCollectionPromise) {
    boundaryCollectionPromise = fetch(isabelaGeoJsonUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load Isabela boundaries (${response.status}).`);
        return response.json();
      })
      .catch((error) => {
        console.error('[ALERT-CIA] Isabela boundary file failed:', error.message);
        return { type: 'FeatureCollection', features: [] };
      });
  }
  return boundaryCollectionPromise;
}

export async function loadEchagueBoundaryCollection() {
  if (!echagueBoundaryCollectionPromise) {
    echagueBoundaryCollectionPromise = fetch(echagueGeoJsonUrl || ECHAGUE_GIS.barangayGeoJsonUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load Echague boundaries (${response.status}).`);
        return response.json();
      })
      .catch((error) => {
        console.error('[ALERT-CIA] Echague boundary file failed:', error.message);
        return { type: 'FeatureCollection', features: [] };
      });
  }
  return echagueBoundaryCollectionPromise;
}

function featureLocation(feature, fallback = {}) {
  const properties = feature?.properties || {};
  const rawBarangay = getFeatureBarangayName(feature) || fallback.barangay || '';
  const rawMunicipality = properties.NAME_2 || properties.MUNICIPALITY || properties.municipality || fallback.municipality || '';
  const municipality = canonicalMunicipalityName(rawMunicipality || (rawBarangay ? ECHAGUE_GIS.name.replace(/^Municipality of\s+/i, '') : ''));
  const barangay = normalizeName(municipality) === normalizeName('Echague')
    ? matchBarangayName(rawBarangay)
    : rawBarangay;

  return {
    barangay,
    municipality,
    province: properties.NAME_1 || properties.PROVINCE || fallback.province || 'Isabela',
    gid: properties.GID_3 || properties.ADM4_PCODE || properties.ID || fallback.gid || '',
  };
}

function findContainingFeature(collection, latitude, longitude) {
  const clickedPoint = turfPoint([longitude, latitude]);
  return (collection?.features || []).find((candidate) => {
    try {
      return booleanPointInPolygon(clickedPoint, candidate);
    } catch {
      return false;
    }
  });
}

async function loadBoundaryIndex() {
  if (!boundaryIndexPromise) {
    boundaryIndexPromise = Promise.all([
      loadIsabelaBoundaryCollection(),
      loadEchagueBoundaryCollection(),
    ])
      .then(([isabelaCollection, echagueCollection]) => {
        const index = new Map();
        const collections = [isabelaCollection, echagueCollection];
        for (const collection of collections) for (const feature of collection?.features || []) {
          const properties = feature.properties || {};
          const { barangay, municipality } = featureLocation(feature);
          if (!municipality || !barangay || !feature.geometry) continue;
          index.set(locationKey(barangay, municipality), feature);
          if (properties.VARNAME_3 && properties.VARNAME_3 !== 'NA') {
            index.set(locationKey(properties.VARNAME_3, municipality), feature);
          }
        }
        return index;
      });
  }
  return boundaryIndexPromise;
}

export async function resolveIsabelaBarangayGeometry({ barangay, municipality } = {}) {
  if (!barangay || !municipality) return null;
  const index = await loadBoundaryIndex();
  const feature = index.get(locationKey(barangay, municipality));
  if (!feature) return null;
  const point = pointOnFeature(feature);
  const [lng, lat] = point.geometry.coordinates;
  const location = featureLocation(feature, { barangay, municipality });
  return {
    lat: Number(lat),
    lng: Number(lng),
    feature,
    barangay: location.barangay || barangay,
    municipality: location.municipality || municipality,
    gid: location.gid || `${municipality}-${barangay}`,
    precision: 'barangay_boundary',
    source: normalizeName(location.municipality) === normalizeName('Echague') ? 'echague_barangays.geojson' : 'Isabela.geojson',
  };
}

export async function resolveIsabelaPointLocation({ lat, lng } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const [echagueCollection, isabelaCollection] = await Promise.all([
    loadEchagueBoundaryCollection(),
    loadIsabelaBoundaryCollection(),
  ]);
  const echagueFeature = findContainingFeature(echagueCollection, latitude, longitude);
  const fallbackFeature = echagueFeature ? null : findContainingFeature(isabelaCollection, latitude, longitude);
  const feature = echagueFeature || fallbackFeature;
  if (!feature) return null;
  const boundaryLocation = featureLocation(feature);
  const override = locationOverrideForPoint(latitude, longitude, boundaryLocation);
  const location = override ? {
    barangay: override.barangay,
    municipality: override.municipality,
    province: override.province,
    gid: boundaryLocation.gid,
  } : boundaryLocation;

  return {
    barangay: location.barangay,
    municipality: location.municipality,
    province: location.province,
    gid: location.gid,
    feature,
    precision: 'barangay_boundary',
    source: override?.source || (echagueFeature ? 'echague_barangays.geojson' : 'Isabela.geojson'),
    sourceReason: override?.reason || '',
  };
}

async function loadMunicipalityIndex() {
  if (!municipalityIndexPromise) {
    municipalityIndexPromise = loadIsabelaBoundaryCollection().then((collection) => {
      const index = new Map();
      for (const feature of collection?.features || []) {
        const municipality = feature.properties?.NAME_2 || feature.properties?.MUNICIPALITY || '';
        if (!municipality || !feature.geometry) continue;
        const key = normalizeName(municipality);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(feature);
      }
      return index;
    });
  }
  return municipalityIndexPromise;
}

export async function resolveIsabelaMunicipalityGeometry({ municipality } = {}) {
  if (!municipality) return null;
  const index = await loadMunicipalityIndex();
  const features = index.get(normalizeName(municipality)) || [];
  if (!features.length) return null;
  const point = pointOnFeature({ type: 'FeatureCollection', features });
  const [lng, lat] = point.geometry.coordinates;
  return {
    lat: Number(lat),
    lng: Number(lng),
    municipality: canonicalMunicipalityName(features[0]?.properties?.NAME_2 || municipality),
    precision: 'municipality_center',
    source: 'Isabela.geojson',
  };
}
