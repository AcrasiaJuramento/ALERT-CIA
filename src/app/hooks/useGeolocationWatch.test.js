import test from 'node:test';
import assert from 'node:assert/strict';
import { geolocationErrorStatus } from './useGeolocationWatch.js';

test('maps browser geolocation errors to user-facing monitor states', () => {
  assert.equal(geolocationErrorStatus({ code: 1 }), 'denied');
  assert.equal(geolocationErrorStatus({ code: 2 }), 'unavailable');
  assert.equal(geolocationErrorStatus({ code: 3 }), 'timeout');
  assert.equal(geolocationErrorStatus(new Error('GPS failed')), 'unavailable');
});
