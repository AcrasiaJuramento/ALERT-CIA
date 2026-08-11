const EARTH_RADIUS_METERS = 6371008.8;

export const APPROACH_WARNING_METERS = 500;
export const CAUTION_WARNING_METERS = 200;
export const RESET_BUFFER_METERS = 100;

export function distanceMeters(first, second) {
  const toRadians = value => (Number(value) * Math.PI) / 180;
  const lat1 = toRadians(first.latitude ?? first[0]);
  const lat2 = toRadians(second.latitude ?? second[0]);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(second.longitude ?? second[1]) - toRadians(first.longitude ?? first[1]);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function warningForDistance(zone, centerDistanceMeters) {
  const boundaryDistance = Math.round(centerDistanceMeters - Number(zone.radiusMeters || 250));
  if (boundaryDistance <= 0) {
    return { level: 'danger', priority: 3, distance: 0, message: 'Danger: You are currently inside an accident-prone area. Please slow down and drive carefully.' };
  }
  if (boundaryDistance <= CAUTION_WARNING_METERS) {
    return { level: 'caution', priority: 2, distance: boundaryDistance, message: `Caution: Accident-prone area ahead in ${boundaryDistance} meters.` };
  }
  if (boundaryDistance <= APPROACH_WARNING_METERS) {
    return { level: 'warning', priority: 1, distance: boundaryDistance, message: `Warning: You are approaching an accident-prone area in ${boundaryDistance} meters.` };
  }
  return null;
}

export function evaluateHazards(location, zones = []) {
  return zones
    .filter(zone => Number.isFinite(Number(zone.latitude)) && Number.isFinite(Number(zone.longitude)))
    .map(zone => ({
      ...warningForDistance(zone, distanceMeters(location, zone)),
      zone,
      centerDistance: distanceMeters(location, zone),
    }))
    .filter(item => item.level)
    .sort((a, b) => b.priority - a.priority || a.distance - b.distance);
}

export function shouldNotify(previousLevel, nextLevel) {
  const rank = { warning: 1, caution: 2, danger: 3 };
  return !previousLevel || (rank[nextLevel] || 0) > (rank[previousLevel] || 0);
}
