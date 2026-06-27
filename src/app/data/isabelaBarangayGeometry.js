import pointOnFeature from '@turf/point-on-feature';
import isabelaGeoJsonUrl from './Isabela.geojson?url';

let boundaryIndexPromise;
let boundaryCollectionPromise;

function normalizeName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\bgeneral\b/g, 'gen')
    .replace(/\bsanta\b/g, 'sta')
    .replace(/\bsanto\b/g, 'sto')
    .replace(/\b(?:city|municipality|barangay|brgy|bgy|baryo|poblacion)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function locationKey(barangay, municipality) {
  return `${normalizeName(municipality)}|${normalizeName(barangay)}`;
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

async function loadBoundaryIndex() {
  if (!boundaryIndexPromise) {
    boundaryIndexPromise = loadIsabelaBoundaryCollection()
      .then((collection) => {
        const index = new Map();
        for (const feature of collection?.features || []) {
          const properties = feature.properties || {};
          const municipality = properties.NAME_2 || properties.MUNICIPALITY || '';
          const barangay = properties.NAME_3 || properties.BARANGAY || properties.name || '';
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
  return {
    lat: Number(lat),
    lng: Number(lng),
    feature,
    barangay: feature.properties?.NAME_3 || barangay,
    municipality: feature.properties?.NAME_2 || municipality,
    gid: feature.properties?.GID_3 || `${municipality}-${barangay}`,
    precision: 'barangay_boundary',
    source: 'Isabela.geojson',
  };
}
