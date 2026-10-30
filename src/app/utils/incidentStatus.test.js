import test from 'node:test';
import assert from 'node:assert/strict';
import { getIncidentRecordStatus, getIncidentStatusLabel, isWebScrapedIncident, isAmbulanceAssigned } from './incidentStatus.js';

test('existing promoted news keeps its web scraped status regardless of response stage', () => {
  for (const status of ['draft', 'on_scene', 'pcr_completed']) {
    const mapped = getIncidentRecordStatus({ record_origin: 'promoted_scraped', status });
    assert.equal(mapped, 'scraped');
    assert.equal(getIncidentStatusLabel(mapped), 'Web Scraped');
    assert.equal(isAmbulanceAssigned(mapped), false);
  }
});

test('recognizes scraper links and mapped source metadata', () => {
  assert.equal(isWebScrapedIncident({ scraper_record_id: 'news-id' }), true);
  assert.equal(isWebScrapedIncident({ scraperRecordId: 'news-id' }), true);
  assert.equal(isWebScrapedIncident({ sourceKind: 'reviewed_scraped' }), true);
  assert.equal(isWebScrapedIncident({ status: 'scraped' }), true);
});

test('normal incidents retain their response statuses', () => {
  for (const status of ['draft', 'on_scene', 'pcr_completed']) {
    assert.equal(getIncidentRecordStatus({ record_origin: 'official', status }), status);
  }
  assert.equal(isWebScrapedIncident({ record_origin: 'official' }), false);
  assert.equal(getIncidentRecordStatus({}), 'draft');
});
