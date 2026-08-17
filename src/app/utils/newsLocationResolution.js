import { isWithinIsabelaMapArea } from './mapData.js';

export function normalizeLocationName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\bgeneral\b/g, 'gen')
    .replace(/\bsanta\b/g, 'sta')
    .replace(/\bsanto\b/g, 'sto')
    .replace(/\b(?:city|municipality|barangay|brgy|bgy|baryo|poblacion)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function hasCoordinateValues(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
  return isWithinIsabelaMapArea({ lat: Number(lat), lng: Number(lng) });
}

function coordinateResult(lat, lng, details = {}) {
  return {
    latitude: Number(lat),
    longitude: Number(lng),
    accuracy: details.accuracy || 'barangay_only',
    source: details.source || 'barangay_centroid',
    label: details.label || 'Approximate location based on available location data',
    approximate: details.approximate !== false,
    matchedRecord: details.matchedRecord || null,
  };
}

function geographyPoint(value) {
  if (!value) return null;
  if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
    return { lat: Number(value.coordinates[1]), lng: Number(value.coordinates[0]) };
  }
  if (value.type === 'Point' && Array.isArray(value.coordinates)) {
    return { lat: Number(value.coordinates[1]), lng: Number(value.coordinates[0]) };
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const match = text.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return null;
  return { lat: Number(match[2]), lng: Number(match[1]) };
}

function recordFields(record = {}) {
  const payloadLocation = record.rawPayload?.location || {};
  return {
    municipality: record.verifiedMunicipality || record.extractedMunicipality || payloadLocation.municipality || payloadLocation.city || '',
    barangay: record.verifiedBarangay || record.extractedBarangay || payloadLocation.barangay || '',
    purokSitio: record.verifiedPurokSitio || record.extractedPurokSitio || payloadLocation.purokSitio || payloadLocation.purok || payloadLocation.sitio || '',
    road: record.verifiedRoadPlace || payloadLocation.road || payloadLocation.roadPlace || payloadLocation.street || '',
    landmark: payloadLocation.landmark || record.locationConfidence?.landmark_name || '',
    landmarkId: payloadLocation.landmarkId || record.locationConfidence?.landmark_id || '',
    rawLocation: record.rawLocationText || record.location || payloadLocation.locationText || '',
  };
}

function sameLocation(left = '', right = '') {
  const a = normalizeLocationName(left);
  const b = normalizeLocationName(right);
  return !a || !b || a === b;
}

function usableLandmark(landmark = {}, fields = {}) {
  if (!hasCoordinateValues(landmark.latitude, landmark.longitude)) return false;
  if (['conflict', 'outside_boundary'].includes(landmark.validationStatus)) return false;
  if (!sameLocation(landmark.municipality, fields.municipality)) return false;
  return !fields.barangay || sameLocation(landmark.barangay || landmark.detectedBarangay, fields.barangay);
}

function landmarkVariants(landmark = {}) {
  return [landmark.name, ...(landmark.aliases || [])].filter(Boolean);
}

function textMatchesVariant(text = '', variant = '') {
  const normalizedText = normalizeLocationName(text);
  const normalizedVariant = normalizeLocationName(variant);
  return normalizedVariant.length >= 3 && normalizedText.includes(normalizedVariant);
}

function landmarkRank(landmark = {}) {
  if (landmark.officerVerified || landmark.verificationStatus === 'officer_verified') return 1;
  if (landmark.verificationStatus === 'auto_validated') return 2;
  if (['lgu', 'government'].includes(landmark.source)) return 3;
  return 4;
}

function isUsefulRoad(value = '') {
  if (/\b(?:unspecified|unknown|none|n\/?a)\b/i.test(String(value))) return false;
  const normalized = normalizeLocationName(value);
  return normalized.length >= 3 && !['road', 'street', 'highway', 'unspecified', 'unknown', 'none'].includes(normalized);
}

function findLandmarkMatch(fields, landmarks, { verifiedOnly = false } = {}) {
  const evidence = [fields.landmark, fields.road, fields.purokSitio, fields.rawLocation].filter(Boolean).join(' ');
  return landmarks
    .filter(landmark => usableLandmark(landmark, fields))
    .filter(landmark => !verifiedOnly || landmark.officerVerified || landmark.verificationStatus === 'officer_verified')
    .filter(landmark => String(landmark.id) === String(fields.landmarkId) || landmarkVariants(landmark).some(variant => textMatchesVariant(evidence, variant)))
    .sort((left, right) => landmarkRank(left) - landmarkRank(right) || String(right.name || '').length - String(left.name || '').length)[0] || null;
}

function findRoadRegistryMatch(fields, landmarks) {
  if (!isUsefulRoad(fields.road)) return null;
  return landmarks
    .filter(landmark => usableLandmark(landmark, fields))
    .filter(landmark => landmarkVariants(landmark).some(variant => textMatchesVariant(fields.road, variant) || textMatchesVariant(variant, fields.road)))
    .sort((left, right) => landmarkRank(left) - landmarkRank(right))[0] || null;
}

function findBarangayPoint(fields, barangays = []) {
  if (!fields.barangay || !fields.municipality) return null;
  const match = barangays.find(item => sameLocation(item.name, fields.barangay) && sameLocation(item.municipality, fields.municipality));
  const point = geographyPoint(match?.centroid);
  return point && hasCoordinateValues(point.lat, point.lng) ? { ...point, row: match } : null;
}

function findMunicipalityPoint(fields, barangays = []) {
  if (!fields.municipality) return null;
  const points = barangays
    .filter(item => sameLocation(item.municipality, fields.municipality))
    .map(item => geographyPoint(item.centroid))
    .filter(point => point && hasCoordinateValues(point.lat, point.lng));
  if (!points.length) return null;
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
  };
}

function detectedCoordinateAccuracy(record = {}) {
  const precision = String(record.geocodePrecision || record.locationConfidence?.accuracy || '').toLowerCase();
  if (/landmark|exact/.test(precision)) return 'road_level';
  if (/road|street|purok|sitio/.test(precision)) return 'road_level';
  if (/barangay/.test(precision)) return 'barangay_only';
  return 'municipality';
}

function firstGeocodePoint(results = [], requiredContext = []) {
  const context = requiredContext.map(normalizeLocationName).filter(value => value.length >= 3);
  const match = results.find(result => {
    if (!Array.isArray(result.latLng) || !result.latLng.every(Number.isFinite) || !hasCoordinateValues(result.latLng[0], result.latLng[1])) return false;
    const label = normalizeLocationName(result.label || '');
    return context.every(value => label.includes(value));
  });
  return match ? { lat: Number(match.latLng[0]), lng: Number(match.latLng[1]), result: match } : null;
}

async function resolveGeometry(resolver, fields) {
  try {
    return await resolver(fields);
  } catch {
    return null;
  }
}

async function geocodeSafely(geocode, query, limit) {
  try {
    const results = await geocode(query, limit);
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

export async function searchIsabelaLocation(query, limit = 6) {
  if (!String(query || '').trim()) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=${limit}`, { signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.results) ? payload.results : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveNewsCorrectionLocation(record = {}, dependencies = {}) {
  const fields = recordFields(record);
  const landmarks = dependencies.landmarks || [];
  const barangays = dependencies.barangays || [];
  const geocode = dependencies.geocode || searchIsabelaLocation;
  const resolveBarangay = dependencies.resolveBarangay || (async () => null);
  const resolveMunicipality = dependencies.resolveMunicipality || (async () => null);
  const lat = record.lat ?? record.latitude;
  const lng = record.lon ?? record.lng ?? record.longitude;
  const corrected = Boolean(record.locationCorrectedAt || record.locationConfidence?.corrected || ['manual_exact', 'officer'].includes(record.locationConfidence?.source));

  if (corrected && hasCoordinateValues(lat, lng)) {
    return { ...fields, ...coordinateResult(lat, lng, {
      accuracy: 'near_exact',
      source: 'manual_exact',
      label: 'Existing corrected incident location',
      approximate: false,
    }) };
  }

  const verifiedLandmark = findLandmarkMatch(fields, landmarks, { verifiedOnly: true });
  if (verifiedLandmark) {
    return { ...fields, ...coordinateResult(verifiedLandmark.latitude, verifiedLandmark.longitude, {
      accuracy: 'near_exact',
      source: 'local_landmark_registry',
      label: `Verified Location Matching entry: ${verifiedLandmark.name}`,
      approximate: false,
      matchedRecord: verifiedLandmark,
    }) };
  }

  const landmark = findLandmarkMatch(fields, landmarks);
  if (landmark) {
    return { ...fields, ...coordinateResult(landmark.latitude, landmark.longitude, {
      accuracy: 'road_level',
      source: 'landmark',
      label: `Approximate location based on matched location: ${landmark.name}`,
      matchedRecord: landmark,
    }) };
  }

  const roadRegistryMatch = findRoadRegistryMatch(fields, landmarks);
  if (roadRegistryMatch) {
    return { ...fields, ...coordinateResult(roadRegistryMatch.latitude, roadRegistryMatch.longitude, {
      accuracy: 'road_level',
      source: 'road',
      label: `Approximate road-level location based on ${roadRegistryMatch.name}`,
      matchedRecord: roadRegistryMatch,
    }) };
  }

  if (isUsefulRoad(fields.road) && fields.municipality) {
    const roadQuery = [fields.road, fields.barangay, fields.municipality, 'Isabela, Philippines'].filter(Boolean).join(', ');
    const roadPoint = firstGeocodePoint(await geocodeSafely(geocode, roadQuery, 6), [fields.municipality]);
    if (roadPoint) {
      return { ...fields, ...coordinateResult(roadPoint.lat, roadPoint.lng, {
        accuracy: 'road_level',
        source: 'road',
        label: `Approximate road-level location based on ${fields.road}${fields.barangay ? `, ${fields.barangay}` : ''}`,
      }) };
    }
  }

  const detectedAccuracy = detectedCoordinateAccuracy(record);
  if (hasCoordinateValues(lat, lng) && detectedAccuracy !== 'municipality') {
    return { ...fields, ...coordinateResult(lat, lng, {
      accuracy: detectedAccuracy,
      source: detectedAccuracy === 'road_level' ? 'road' : 'barangay_centroid',
      label: detectedAccuracy === 'road_level'
        ? `Approximate road-level location based on detected article coordinates`
        : `Approximate location based on ${[fields.barangay, fields.municipality].filter(Boolean).join(', ') || 'detected article coordinates'}`,
    }) };
  }

  const databaseBarangay = findBarangayPoint(fields, barangays);
  if (databaseBarangay) {
    return { ...fields, barangay: databaseBarangay.row?.name || fields.barangay, municipality: databaseBarangay.row?.municipality || fields.municipality, ...coordinateResult(databaseBarangay.lat, databaseBarangay.lng, {
      label: `Approximate location based on ${databaseBarangay.row?.name || fields.barangay}, ${databaseBarangay.row?.municipality || fields.municipality}`,
    }) };
  }

  const barangayGeometry = await resolveGeometry(resolveBarangay, { barangay: fields.barangay, municipality: fields.municipality });
  if (barangayGeometry && hasCoordinateValues(barangayGeometry.lat, barangayGeometry.lng)) {
    return { ...fields, barangay: barangayGeometry.barangay || fields.barangay, municipality: barangayGeometry.municipality || fields.municipality, ...coordinateResult(barangayGeometry.lat, barangayGeometry.lng, {
      label: `Approximate location based on ${barangayGeometry.barangay || fields.barangay}, ${barangayGeometry.municipality || fields.municipality}`,
    }) };
  }

  if (fields.barangay && fields.municipality) {
    const barangayQuery = [fields.barangay, fields.municipality, 'Isabela, Philippines'].join(', ');
    const barangayPoint = firstGeocodePoint(await geocodeSafely(geocode, barangayQuery, 4), [fields.barangay, fields.municipality]);
    if (barangayPoint) {
      return { ...fields, ...coordinateResult(barangayPoint.lat, barangayPoint.lng, {
        label: `Approximate location based on ${fields.barangay}, ${fields.municipality}`,
      }) };
    }
  }

  const databaseMunicipality = findMunicipalityPoint(fields, barangays);
  if (databaseMunicipality) {
    return { ...fields, ...coordinateResult(databaseMunicipality.lat, databaseMunicipality.lng, {
      accuracy: 'barangay_only',
      source: 'municipality_center',
      label: `Approximate location based on ${fields.municipality}`,
    }) };
  }

  const municipalityGeometry = await resolveGeometry(resolveMunicipality, { municipality: fields.municipality });
  if (municipalityGeometry && hasCoordinateValues(municipalityGeometry.lat, municipalityGeometry.lng)) {
    return { ...fields, ...coordinateResult(municipalityGeometry.lat, municipalityGeometry.lng, {
      accuracy: 'barangay_only',
      source: 'municipality_center',
      label: `Approximate location based on ${municipalityGeometry.municipality || fields.municipality}`,
    }) };
  }

  if (fields.municipality) {
    const municipalityPoint = firstGeocodePoint(await geocodeSafely(geocode, `${fields.municipality}, Isabela, Philippines`, 4), [fields.municipality]);
    if (municipalityPoint) {
      return { ...fields, ...coordinateResult(municipalityPoint.lat, municipalityPoint.lng, {
        accuracy: 'barangay_only',
        source: 'municipality_center',
        label: `Approximate location based on ${fields.municipality}`,
      }) };
    }
  }

  return { ...fields,
    latitude: null,
    longitude: null,
    accuracy: 'unmapped',
    source: 'unmapped',
    label: 'Location could not be matched; showing the Isabela map for manual pinning',
    approximate: true,
    matchedRecord: null,
  };
}
