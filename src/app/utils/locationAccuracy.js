const LOW_PRECISION_VALUES = new Set(['barangay', 'barangay_master', 'barangay_boundary', 'municipality']);
const MEDIUM_PRECISION_VALUES = new Set(['road', 'purok', 'sitio']);
const HIGH_PRECISION_VALUES = new Set(['exact', 'landmark', 'intersection', 'manual_exact', 'official_incident_pin', 'incident_coordinates', 'response_pin']);

function normalize(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function locationAssessment(record = {}) {
  const metadata = record.locationConfidence || record.location_confidence || {};
  const source = normalize(metadata.source || record.locationSource || record.location_source || record.coordinateSource);
  const accuracy = normalize(metadata.accuracy || record.locationAccuracy || record.location_accuracy);
  const confidence = normalize(metadata.level || metadata.confidence || record.locationConfidenceLevel || record.location_confidence_level);
  const precision = normalize(record.locationPrecision || record.geocodePrecision || record.geocode_precision);
  const mappingStatus = normalize(record.mappingStatus || record.mapping_status);

  if (mappingStatus === 'unmatched_location' || mappingStatus === 'needs_review' || accuracy === 'unmapped') {
    return {
      level: 'unmapped',
      accuracy: 'unmapped',
      source: source || 'unmapped',
      label: 'Unmapped location',
      pointHotspotEligible: false,
      approximate: true,
    };
  }

  if (confidence === 'high' || accuracy === 'near_exact' || HIGH_PRECISION_VALUES.has(precision) || ['exact', 'landmark', 'manual_exact'].includes(source)) {
    return {
      level: 'high',
      accuracy: accuracy || 'near_exact',
      source: source || precision || 'exact',
      label: source === 'landmark' || precision === 'landmark'
        ? 'Landmark-based location - High confidence'
        : 'Exact or near-exact location - High confidence',
      pointHotspotEligible: true,
      approximate: false,
    };
  }

  if (confidence === 'medium' || accuracy === 'road_level' || MEDIUM_PRECISION_VALUES.has(precision) || ['road', 'purok', 'sitio'].includes(source)) {
    return {
      level: 'medium',
      accuracy: accuracy || 'road_level',
      source: source || precision || 'road',
      label: 'Road-level location - Medium confidence',
      pointHotspotEligible: true,
      approximate: true,
    };
  }

  if (confidence === 'low' || accuracy === 'barangay_only' || LOW_PRECISION_VALUES.has(precision) || ['barangay_centroid', 'barangay_boundary'].includes(source)) {
    return {
      level: 'low',
      accuracy: accuracy || 'barangay_only',
      source: source || precision || 'barangay_centroid',
      label: 'Approximate barangay location - Low confidence',
      pointHotspotEligible: false,
      approximate: true,
    };
  }

  return {
    level: 'low',
    accuracy: 'approximate',
    source: source || precision || 'unknown',
    label: 'Approximate location - Low confidence',
    pointHotspotEligible: false,
    approximate: true,
  };
}

export function canUseForPointHotspot(record = {}) {
  if (record.sourceKind === 'pcr_report') return locationAssessment(record).pointHotspotEligible;
  if (!String(record.sourceKind || '').includes('scraped') && !record.scraperStatus) return true;
  return locationAssessment(record).pointHotspotEligible;
}
