const DEFAULT_PAGE_SIZE = 1000;

function isArcGisServiceUrl(url = '') {
  return /\/FeatureServer(\/\d+)?(?:\/query)?(?:\?|$)|\/MapServer(\/\d+)?(?:\/query)?(?:\?|$)/i.test(url);
}

function stripQuery(url = '') {
  return String(url).split('?')[0].replace(/\/+$/, '');
}

function appendParams(url, params) {
  const target = new URL(url, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      target.searchParams.set(key, String(value));
    }
  });
  return target.toString();
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const preview = body.trim().slice(0, 120);
    throw new Error(
      `Request failed with ${response.status} while loading GIS data${preview ? `: ${preview}` : ''}`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  const trimmed = body.trim();

  if (!trimmed) {
    throw new Error('Empty response while loading GIS data');
  }

  const looksJson = contentType.includes('application/json')
    || contentType.includes('application/geo+json')
    || /^[{\[]/.test(trimmed);

  if (!looksJson) {
    throw new Error(`Expected JSON but received ${contentType || 'unknown content type'}`);
  }

  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    throw new Error('HTML response received instead of JSON');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error('Invalid JSON response while loading GIS data');
  }
}

function normalizeRing(ring = []) {
  return ring.map(([x, y]) => [Number(x), Number(y)]);
}

function arcGisGeometryToGeoJson(geometry = {}) {
  if (Array.isArray(geometry.rings)) {
    return {
      type: 'Polygon',
      coordinates: geometry.rings.map(normalizeRing),
    };
  }

  if (Array.isArray(geometry.paths)) {
    const paths = geometry.paths.map(normalizeRing);
    return {
      type: paths.length > 1 ? 'MultiLineString' : 'LineString',
      coordinates: paths.length > 1 ? paths : paths[0],
    };
  }

  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return {
      type: 'Point',
      coordinates: [Number(geometry.x), Number(geometry.y)],
    };
  }

  return null;
}

function arcGisFeatureToGeoJson(feature = {}) {
  const geometry = arcGisGeometryToGeoJson(feature.geometry);
  if (!geometry) return null;

  return {
    type: 'Feature',
    properties: { ...(feature.attributes || {}) },
    geometry,
  };
}

async function loadArcGisFeatureCollection(url, { where = '1=1', signal } = {}) {
  const serviceUrl = stripQuery(url);
  const layerInfo = await fetchJson(appendParams(serviceUrl, { f: 'json' }), signal);
  const queryUrl = `${serviceUrl}/query`;
  const pageSize = Math.min(
    Number(layerInfo?.maxRecordCount || DEFAULT_PAGE_SIZE),
    DEFAULT_PAGE_SIZE
  );

  const features = [];
  let offset = 0;
  let more = true;

  while (more) {
    const query = appendParams(queryUrl, {
      where,
      outFields: '*',
      returnGeometry: 'true',
      returnDistinctValues: 'false',
      outSR: 4326,
      f: 'json',
      resultRecordCount: pageSize,
      resultOffset: offset,
    });
    const payload = await fetchJson(query, signal);
    const page = Array.isArray(payload?.features) ? payload.features : [];

    page.forEach((feature) => {
      const normalized = arcGisFeatureToGeoJson(feature);
      if (normalized) features.push(normalized);
    });

    more = Boolean(payload?.exceededTransferLimit) && page.length > 0;
    offset += page.length;

    if (!page.length) {
      break;
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function loadGeoJson(url, signal) {
  const payload = await fetchJson(url, signal);
  if (payload?.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return payload;
  }
  if (payload?.type === 'Feature' && payload.geometry) {
    return {
      type: 'FeatureCollection',
      features: [payload],
    };
  }
  return null;
}

export async function loadBoundarySource(source, options = {}) {
  if (!source?.url) return null;

  if (source.type === 'arcgis' || isArcGisServiceUrl(source.url)) {
    return loadArcGisFeatureCollection(source.url, {
      where: source.where || options.where || '1=1',
      signal: options.signal,
    });
  }

  return loadGeoJson(source.url, options.signal);
}

export async function loadBoundarySources(sources = [], options = {}) {
  let lastError = null;

  for (const source of sources) {
    try {
      const data = await loadBoundarySource(source, options);
      if (data?.features?.length) {
        return { data, source };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { data: null, source: null };
}
