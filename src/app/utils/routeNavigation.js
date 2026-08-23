import { readIncidentDate } from './accidentProneAreas.js';

const EARTH_RADIUS_METERS = 6371000;
const DAY_MS = 86400000;

export const OFF_ROUTE_THRESHOLD_METERS = 40;
export const OFF_ROUTE_CONFIRMATION_COUNT = 2;
export const MAX_OFF_ROUTE_GPS_ACCURACY_METERS = 75;
export const REROUTE_COOLDOWN_MS = 5000;
export const LATEST_ACCIDENT_WARNING_DAYS = 3;

export function normalizeBrowserPosition(position) {
  const { latitude, longitude, accuracy } = position?.coords || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    lat: latitude,
    lng: longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    latLng: [latitude, longitude],
  };
}

function pointToSegmentDistanceMeters(point, segmentStart, segmentEnd) {
  const latitudeRadians = (point[0] * Math.PI) / 180;
  const metersPerLatitudeDegree = (Math.PI * EARTH_RADIUS_METERS) / 180;
  const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(latitudeRadians);
  const toLocalPoint = ([lat, lng]) => [
    (lng - point[1]) * metersPerLongitudeDegree,
    (lat - point[0]) * metersPerLatitudeDegree,
  ];

  const [startX, startY] = toLocalPoint(segmentStart);
  const [endX, endY] = toLocalPoint(segmentEnd);
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX ** 2 + segmentY ** 2;
  const ratio = segmentLengthSquared
    ? Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / segmentLengthSquared))
    : 0;
  const closestX = startX + segmentX * ratio;
  const closestY = startY + segmentY * ratio;
  return Math.hypot(closestX, closestY);
}

export function getDistanceFromRouteMeters(location, routeCoordinates = []) {
  const point = Array.isArray(location) ? location : location?.latLng;
  if (!point?.every(Number.isFinite) || routeCoordinates.length < 2) return Infinity;

  let closestDistance = Infinity;
  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    const segmentStart = routeCoordinates[index];
    const segmentEnd = routeCoordinates[index + 1];
    if (!segmentStart?.every(Number.isFinite) || !segmentEnd?.every(Number.isFinite)) continue;
    closestDistance = Math.min(
      closestDistance,
      pointToSegmentDistanceMeters(point, segmentStart, segmentEnd),
    );
  }
  return closestDistance;
}

export function isReliableOffRouteFix(location) {
  return Boolean(
    location?.latLng?.every(Number.isFinite)
    && (!Number.isFinite(location.accuracy) || location.accuracy <= MAX_OFF_ROUTE_GPS_ACCURACY_METERS),
  );
}

export function isLocationOffRoute(location, routeCoordinates = []) {
  if (!isReliableOffRouteFix(location)) return false;
  const threshold = Math.max(
    OFF_ROUTE_THRESHOLD_METERS,
    Number.isFinite(location.accuracy) ? location.accuracy : 0,
  );
  return getDistanceFromRouteMeters(location, routeCoordinates) > threshold;
}

export function getNextOffRouteConfirmationCount(currentCount, location, routeCoordinates = []) {
  return isLocationOffRoute(location, routeCoordinates) ? currentCount + 1 : 0;
}

export function canStartAutomaticReroute({
  navigationActive,
  hasDestination,
  routeCoordinates = [],
  offRouteCount,
  isRerouting,
  lastRerouteAt,
  now = Date.now(),
}) {
  return Boolean(
    navigationActive
    && hasDestination
    && routeCoordinates.length >= 2
    && offRouteCount >= OFF_ROUTE_CONFIRMATION_COUNT
    && !isRerouting
    && now - lastRerouteAt >= REROUTE_COOLDOWN_MS,
  );
}

export function getLatestAccidentWarningAgeDays(record = {}, now = new Date()) {
  const incidentDate = readIncidentDate(record);
  const currentDate = now instanceof Date ? now : new Date(now);
  if (!incidentDate || !Number.isFinite(currentDate.getTime())) return Infinity;
  return (currentDate.getTime() - incidentDate.getTime()) / DAY_MS;
}

export function isLatestAccidentRouteWarning(record = {}, now = new Date()) {
  const ageDays = getLatestAccidentWarningAgeDays(record, now);
  return ageDays >= 0 && ageDays <= LATEST_ACCIDENT_WARNING_DAYS;
}
