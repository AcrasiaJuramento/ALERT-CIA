import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccidentMapRow, REVIEWED_SCRAPER_MAP_STATUSES } from './scrapedMapEligibility.js';
import { hasSupportedIncidentLocation } from '../../../alert-cia-scraper/src/lib/locationEvidence.js';

test('approved news remains eligible after promotion, including legacy review statuses', () => {
  assert.deepEqual(REVIEWED_SCRAPER_MAP_STATUSES, ['approved', 'promoted', 'matched', 'imported']);
  for (const status of ['pending_review', 'ignored', 'failed', 'archived']) {
    assert.equal(REVIEWED_SCRAPER_MAP_STATUSES.includes(status), false);
  }
});

test('Cauayan motorcycle collision wording passes the map accident filter', () => {
  const row = {
    title: '2 rider sugatan sa salpukan ng dalawang motorsiklo sa Cauayan City',
    category: 'other',
    incident_type: 'other',
    verified_municipality: 'Cauayan',
    verified_barangay: 'Minante II',
    location_corrected_at: '2026-10-30T01:00:00Z',
  };
  assert.equal(isAccidentMapRow(row), true);
  assert.equal(hasSupportedIncidentLocation(row), true);
  assert.equal(isAccidentMapRow({ title: 'Motorcycle road safety seminar in Cauayan City' }), false);
});
