import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIncidentTypeKeys,
  matchesIncidentFilters,
  normalizeIncidentSeverity,
} from './incidentFilters.js';

test('normalizes stored priority and triage names to red, yellow, and green', () => {
  assert.equal(normalizeIncidentSeverity('critical'), 'red');
  assert.equal(normalizeIncidentSeverity('Moderate'), 'yellow');
  assert.equal(normalizeIncidentSeverity('low'), 'green');
});

test('derives the requested incident types from PCR fields and classifications', () => {
  assert.deepEqual([...getIncidentTypeKeys({ natureTypes: ['Conduction'] })], ['conduction']);
  assert.equal(getIncidentTypeKeys({ classification: 'medical' }).has('medical'), true);
  assert.equal(getIncidentTypeKeys({ type: 'vehicular' }).has('motor_vehicle_crash'), true);
  assert.equal(getIncidentTypeKeys({ traumaTypes: ['Trauma', 'Motor Vehicle Crash'] }).has('trauma'), true);
});

test('combines severity, type, and workflow status filters', () => {
  const incident = {
    severity: 'red',
    natureTypes: ['Medical'],
    status: 'pcr_completed',
    workflowStatus: 'pending_admin_verification',
  };

  assert.equal(matchesIncidentFilters(incident, {
    severity: 'red',
    type: 'medical',
    status: 'pending_admin_verification',
  }), true);
  assert.equal(matchesIncidentFilters(incident, { severity: 'green' }), false);
});
