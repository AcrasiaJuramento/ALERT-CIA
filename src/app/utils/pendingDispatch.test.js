import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchAlertDetails, isPendingDispatch } from './pendingDispatch.js';

test('only sent, unaccepted dispatches trigger the alarm', () => {
  for (const status of ['Sent to Responding Team', 'Sent to Field Officer', 'sent_to_responding_team']) {
    assert.equal(isPendingDispatch({ responseId: 'response-1', status }), true);
  }
  for (const status of ['Draft', 'Dispatched', 'Accepted by Responding Team', 'PCR In Progress', 'PCR Completed', 'Cancelled', 'Returned for Correction']) {
    assert.equal(isPendingDispatch({ responseId: 'response-1', status }), false);
  }
  assert.equal(isPendingDispatch({ status: 'Sent to Responding Team' }), false);
  assert.equal(isPendingDispatch({ responseId: 'r', status: 'Sent to Responding Team', acceptedAt: '2026-09-07' }), false);
  assert.equal(isPendingDispatch({ responseId: 'r', status: 'Sent to Responding Team', resolvedAt: '2026-09-07' }), false);
});

test('popup preserves dispatcher description, incident, location and contact', () => {
  const details = Object.fromEntries(dispatchAlertDetails({
    notes: 'Two vehicles involved.\nBring rescue equipment.', natureTypes: ['MVC'],
    placeOfIncident: 'Main road', callerName: 'Caller', callerContact: '123', assistanceNeeded: ['Rescue'],
  }));
  assert.equal(details.Description, 'Two vehicles involved.\nBring rescue equipment.');
  assert.equal(details.Incident, 'MVC');
  assert.equal(details.Location, 'Main road');
  assert.equal(details.Caller, 'Caller • 123');
  assert.equal(details['Assistance needed'], 'Rescue');
  assert.deepEqual(dispatchAlertDetails(), []);
});
