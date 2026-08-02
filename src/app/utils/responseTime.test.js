import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAverageResponseMinutes, formatResponseDuration } from './responseTime.js';

test('computes average response time from dispatch and arrival values', () => {
  const average = computeAverageResponseMinutes([
    { dispatchedTime: '08:00', arrivalScene: '08:15' },
    { dispatchedTime: '09:00', arrivalScene: '09:20' },
    { dispatchedTime: '10:00', arrivalScene: '10:05' },
  ]);

  assert.equal(average, 13);
});

test('formats response duration into a readable string', () => {
  assert.equal(formatResponseDuration(75), '1h 15m');
  assert.equal(formatResponseDuration(12), '12 min');
  assert.equal(formatResponseDuration(null), '-');
});
