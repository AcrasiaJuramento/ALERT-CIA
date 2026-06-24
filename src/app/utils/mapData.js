const ECHAGUE_BOUNDS = {
  north: 16.765,
  south: 16.625,
  west: 121.57,
  east: 121.74,
};

export const ECHAGUE_CENTER = [16.705, 121.676];

export function percentToLatLng(coordinates = {}) {
  const x = Number(coordinates.x ?? 50);
  const y = Number(coordinates.y ?? 50);
  const lat = ECHAGUE_BOUNDS.north - ((Math.min(Math.max(y, 0), 100) / 100) * (ECHAGUE_BOUNDS.north - ECHAGUE_BOUNDS.south));
  const lng = ECHAGUE_BOUNDS.west + ((Math.min(Math.max(x, 0), 100) / 100) * (ECHAGUE_BOUNDS.east - ECHAGUE_BOUNDS.west));

  return [lat, lng];
}

export function svgPointToLatLng(point = {}, width = 900, height = 650) {
  return percentToLatLng({
    x: (Number(point.x ?? width / 2) / width) * 100,
    y: (Number(point.y ?? height / 2) / height) * 100,
  });
}

export function latLngToSvgPoint(latLng = {}, width = 900, height = 650) {
  const lat = Array.isArray(latLng) ? latLng[0] : latLng.lat;
  const lng = Array.isArray(latLng) ? latLng[1] : latLng.lng;
  const xPercent = ((Number(lng) - ECHAGUE_BOUNDS.west) / (ECHAGUE_BOUNDS.east - ECHAGUE_BOUNDS.west)) * 100;
  const yPercent = ((ECHAGUE_BOUNDS.north - Number(lat)) / (ECHAGUE_BOUNDS.north - ECHAGUE_BOUNDS.south)) * 100;

  return {
    x: Math.min(Math.max((xPercent / 100) * width, 0), width),
    y: Math.min(Math.max((yPercent / 100) * height, 0), height),
  };
}

export function getIncidentLatLng(incident) {
  if (Number.isFinite(incident?.lat) && Number.isFinite(incident?.lng)) {
    return [incident.lat, incident.lng];
  }

  if (Number.isFinite(incident?.latitude) && Number.isFinite(incident?.longitude)) {
    return [incident.latitude, incident.longitude];
  }

  return percentToLatLng(incident?.coordinates);
}

export function getAdvisoryLatLng(advisory) {
  if (Number.isFinite(advisory?.lat) && Number.isFinite(advisory?.lng)) {
    return [advisory.lat, advisory.lng];
  }

  if (Number.isFinite(advisory?.latitude) && Number.isFinite(advisory?.longitude)) {
    return [advisory.latitude, advisory.longitude];
  }

  if (Number.isFinite(advisory?.coordinates?.lat) && Number.isFinite(advisory?.coordinates?.lng)) {
    return [advisory.coordinates.lat, advisory.coordinates.lng];
  }

  if (Number.isFinite(advisory?.coordinates?.x) && Number.isFinite(advisory?.coordinates?.y)) {
    return percentToLatLng(advisory.coordinates);
  }

  return null;
}

export function getZoneLatLng(zone) {
  if (Number.isFinite(zone?.lat) && Number.isFinite(zone?.lng)) {
    return [zone.lat, zone.lng];
  }

  return percentToLatLng(zone);
}

export function getHeatPoint(zone) {
  const [lat, lng] = getZoneLatLng(zone);
  return [lat, lng, Number(zone.intensity ?? 0.5)];
}

export function getBoundsForIncidents(incidents = []) {
  const points = incidents.map(getIncidentLatLng);
  if (!points.length) return null;

  return points;
}
