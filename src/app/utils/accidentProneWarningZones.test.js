import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAccidentProneAreaRadiusMeters,
  toAccidentProneWarningZone,
} from './accidentProneWarningZones.js';

test('normalizes a calculated critical road safety area for proximity warnings', () => {
  const zone = toAccidentProneWarningZone({
    area_id: 'APA-1-test',
    barangay: 'Test Barangay',
    latitude: 16.72256,
    longitude: 121.68568,
    risk_level: 'Critical',
  });

  assert.equal(zone.id, 'calculated-APA-1-test');
  assert.equal(zone.label, 'Critical Road Safety Zone: Test Barangay');
  assert.equal(zone.radiusMeters, 520);
  assert.equal(zone.latitude, 16.72256);
  assert.equal(zone.longitude, 121.68568);
});

test('matches the map radius for each calculated risk level', () => {
  assert.equal(getAccidentProneAreaRadiusMeters({ risk_level: 'Critical' }), 520);
  assert.equal(getAccidentProneAreaRadiusMeters({ risk_level: 'High' }), 420);
  assert.equal(getAccidentProneAreaRadiusMeters({ risk_level: 'Moderate' }), 320);
  assert.equal(getAccidentProneAreaRadiusMeters({ risk_level: 'Low' }), 240);
});
