import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canStartAutomaticReroute,
  getDistanceFromRouteMeters,
  getOffRouteThresholdMeters,
  getLatestAccidentWarningAgeDays,
  getNextOffRouteConfirmationCount,
  isLatestAccidentRouteWarning,
  isLocationOffRoute,
  LATEST_ACCIDENT_WARNING_DAYS,
  normalizeBrowserPosition,
} from './routeNavigation.js';

const route = [
  [16.7, 121.67],
  [16.7, 121.68],
];

test('normalizes a browser GPS position while preserving accuracy', () => {
  assert.deepEqual(normalizeBrowserPosition({
    coords: { latitude: 16.7, longitude: 121.67, accuracy: 12 },
  }), {
    lat: 16.7,
    lng: 121.67,
    accuracy: 12,
    latLng: [16.7, 121.67],
  });
});

test('measures distance to route segments instead of only route vertices', () => {
  const distance = getDistanceFromRouteMeters([16.70009, 121.675], route);
  assert.ok(distance > 9 && distance < 11);
});

test('treats a reliable reading beyond the route corridor as off-route', () => {
  assert.equal(isLocationOffRoute({ latLng: [16.7005, 121.675], accuracy: 8 }, route), true);
});

test('does not use a very inaccurate reading as off-route evidence', () => {
  assert.equal(isLocationOffRoute({ latLng: [16.702, 121.675], accuracy: 120 }, route), false);
});

test('uses a less precise GPS reading when the route deviation is decisive', () => {
  assert.equal(getOffRouteThresholdMeters({ accuracy: 120 }), 240);
  assert.equal(isLocationOffRoute({ latLng: [16.704, 121.675], accuracy: 120 }, route), true);
});

test('uses reported accuracy as a wider noise floor when it is still usable', () => {
  assert.equal(isLocationOffRoute({ latLng: [16.70045, 121.675], accuracy: 60 }, route), false);
});

test('requires consecutive off-route readings and resets after an on-route reading', () => {
  const offRouteFix = { latLng: [16.7005, 121.675], accuracy: 8 };
  const onRouteFix = { latLng: [16.70005, 121.675], accuracy: 8 };
  const firstCount = getNextOffRouteConfirmationCount(0, offRouteFix, route);
  const secondCount = getNextOffRouteConfirmationCount(firstCount, offRouteFix, route);

  assert.equal(firstCount, 1);
  assert.equal(secondCount, 2);
  assert.equal(getNextOffRouteConfirmationCount(secondCount, onRouteFix, route), 0);
});

test('blocks automatic rerouting during an active request or cooldown', () => {
  const base = {
    navigationActive: true,
    hasDestination: true,
    routeCoordinates: route,
    offRouteCount: 2,
    lastRerouteAt: 1000,
    now: 7000,
  };

  assert.equal(canStartAutomaticReroute({ ...base, isRerouting: false }), true);
  assert.equal(canStartAutomaticReroute({ ...base, isRerouting: true }), false);
  assert.equal(canStartAutomaticReroute({ ...base, isRerouting: false, now: 5000 }), false);
});

test('keeps latest accident route warnings inside the three day window', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');

  assert.equal(isLatestAccidentRouteWarning({ incidentDate: '2026-08-21T12:00:00.000Z' }, now), true);
  assert.equal(isLatestAccidentRouteWarning({ incidentDate: '2026-08-20T12:00:00.000Z' }, now), true);
  assert.equal(isLatestAccidentRouteWarning({ incidentDate: '2026-08-20T11:59:59.000Z' }, now), false);
  assert.equal(isLatestAccidentRouteWarning({ incidentDate: '2026-08-24T12:00:00.000Z' }, now), false);
  assert.equal(isLatestAccidentRouteWarning({ scrapedAt: '2026-08-23T12:00:00.000Z' }, now), false);
});

test('reports latest accident warning age in days', () => {
  const now = new Date('2026-08-23T12:00:00.000Z');
  assert.equal(getLatestAccidentWarningAgeDays({ incidentDate: '2026-08-21T12:00:00.000Z' }, now), 2);
  assert.equal(LATEST_ACCIDENT_WARNING_DAYS, 3);
});
