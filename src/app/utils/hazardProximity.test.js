import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ZONE_RADIUS_METERS,
  evaluateHazards,
  evaluateZoneTransitions,
  getZoneRadiusMeters,
  shouldNotify,
  warningForDistance,
} from './hazardProximity.js';

const zone = { id: 'z1', latitude: 0, longitude: 0, radiusMeters: 100 };

test('uses distance to the zone boundary for warning thresholds', () => {
  assert.equal(warningForDistance(zone, 601), null);
  assert.equal(warningForDistance(zone, 600).level, 'warning');
  assert.equal(warningForDistance(zone, 300).level, 'caution');
  assert.equal(warningForDistance(zone, 100).level, 'danger');
});

test('prioritizes danger and only notifies on escalation', () => {
  const matches = evaluateHazards({ latitude: 0, longitude: 0 }, [zone]);
  assert.equal(matches[0].level, 'danger');
  assert.equal(shouldNotify('warning', 'caution'), true);
  assert.equal(shouldNotify('danger', 'danger'), false);
  assert.equal(shouldNotify('caution', 'warning'), false);
});

test('tracks outside, entry, stay, exit, and re-entry transitions', () => {
  let insideZoneIds = new Set();

  let result = evaluateZoneTransitions({ latitude: 0.002, longitude: 0 }, [zone], insideZoneIds);
  assert.equal(result.entered.length, 0);
  insideZoneIds = result.insideZoneIds;

  result = evaluateZoneTransitions({ latitude: 0.0008, longitude: 0 }, [zone], insideZoneIds);
  assert.equal(result.entered.length, 1);
  insideZoneIds = result.insideZoneIds;

  result = evaluateZoneTransitions({ latitude: 0, longitude: 0 }, [zone], insideZoneIds);
  assert.equal(result.entered.length, 0);
  assert.equal(result.exited.length, 0);
  insideZoneIds = result.insideZoneIds;

  result = evaluateZoneTransitions({ latitude: 0.00108, longitude: 0 }, [zone], insideZoneIds, { exitBufferMeters: 50 });
  assert.equal(result.exited.length, 0, 'GPS jitter just outside the radius stays inside the buffered boundary');
  insideZoneIds = result.insideZoneIds;

  result = evaluateZoneTransitions({ latitude: 0.0015, longitude: 0 }, [zone], insideZoneIds, { exitBufferMeters: 50 });
  assert.equal(result.exited.length, 1);
  insideZoneIds = result.insideZoneIds;

  result = evaluateZoneTransitions({ latitude: 0.0008, longitude: 0 }, [zone], insideZoneIds);
  assert.equal(result.entered.length, 1);
});

test('uses a configured radius and falls back to the application default', () => {
  assert.equal(getZoneRadiusMeters(zone), 100);
  assert.equal(getZoneRadiusMeters({ ...zone, radiusMeters: null }), DEFAULT_ZONE_RADIUS_METERS);

  const defaultRadiusZone = { id: 'default-radius', latitude: 0, longitude: 0 };
  const result = evaluateZoneTransitions({ latitude: 0.002, longitude: 0 }, [defaultRadiusZone]);
  assert.equal(result.entered.length, 1);
  assert.equal(result.entered[0].radiusMeters, DEFAULT_ZONE_RADIUS_METERS);
});
