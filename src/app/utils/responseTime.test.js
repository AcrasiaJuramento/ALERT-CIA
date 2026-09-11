import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAverageResponseMinutes, computeAverageWholeResponseMinutes, formatResponseDuration } from './responseTime.js';

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

test('computes whole response time for hospital and no-hospital completed workflows', () => {
  const average = computeAverageWholeResponseMinutes([
    { dateOfIncident: '2026-09-11', timeOfIncident: '08:00', dispatchedTime: '08:05', acceptedAt: '2026-09-11T08:10:00', arrivalScene: '08:20', departureScene: '08:40', arrivalHospital: '09:00', departureHospital: '09:30', backToBase: '10:00' },
    { dateOfIncident: '2026-09-11', timeOfIncident: '09:00', dispatchedTime: '09:05', acceptedAt: '2026-09-11T09:10:00', arrivalScene: '09:20', departureScene: '09:40', backToBase: '10:00' },
    { dateOfIncident: '2026-09-11', timeOfIncident: '11:00', dispatchedTime: '10:55', acceptedAt: '2026-09-11T11:05:00', arrivalScene: '11:20', departureScene: '11:40', backToBase: '12:00' },
  ]);

  assert.equal(average, 90);
});
