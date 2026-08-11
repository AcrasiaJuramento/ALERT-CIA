import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHazards, shouldNotify, warningForDistance } from './hazardProximity.js';

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
