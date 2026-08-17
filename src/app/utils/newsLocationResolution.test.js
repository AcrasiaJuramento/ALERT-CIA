import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNewsCorrectionLocation } from './newsLocationResolution.js';

const noGeocode = async () => [];
const noGeometry = async () => null;

test('existing corrected coordinates take priority over registry matches', async () => {
  const result = await resolveNewsCorrectionLocation({
    lat: 16.6912,
    lon: 121.5895,
    locationCorrectedAt: '2026-08-17T00:00:00Z',
    extractedMunicipality: 'Santiago',
    extractedBarangay: 'Calao East',
    rawLocationText: 'Near Test Bridge',
  }, {
    landmarks: [{ id: 'landmark-1', name: 'Test Bridge', municipality: 'Santiago', barangay: 'Calao East', latitude: 16.7, longitude: 121.6, officerVerified: true }],
    geocode: noGeocode,
  });

  assert.equal(result.source, 'manual_exact');
  assert.equal(result.approximate, false);
  assert.equal(result.latitude, 16.6912);
  assert.equal(result.longitude, 121.5895);
});

test('verified Location Matching entry is reused when mentioned by the article', async () => {
  const result = await resolveNewsCorrectionLocation({
    extractedMunicipality: 'Santiago City',
    extractedBarangay: 'Calao East',
    rawLocationText: 'Accident near Calao East Public Market',
  }, {
    landmarks: [{
      id: 'verified-market',
      name: 'Calao East Public Market',
      aliases: ['Calao Market'],
      municipality: 'Santiago',
      barangay: 'Calao East',
      latitude: 16.6888,
      longitude: 121.5901,
      officerVerified: true,
      verificationStatus: 'officer_verified',
      validationStatus: 'valid',
    }],
    geocode: noGeocode,
  });

  assert.equal(result.source, 'local_landmark_registry');
  assert.equal(result.approximate, false);
  assert.equal(result.matchedRecord.id, 'verified-market');
});

test('known road match within Calao East is preferred over the barangay center', async () => {
  const result = await resolveNewsCorrectionLocation({
    extractedMunicipality: 'Santiago',
    extractedBarangay: 'Calao East',
    rawPayload: { location: { road: 'Maharlika Highway' } },
  }, {
    barangays: [{ name: 'Calao East', municipality: 'Santiago', centroid: 'POINT(121.58 16.68)' }],
    geocode: async query => {
      assert.match(query, /Maharlika Highway, Calao East, Santiago/);
      return [{ label: 'Maharlika Highway, Calao East, Santiago', latLng: [16.692, 121.601] }];
    },
  });

  assert.equal(result.source, 'road');
  assert.equal(result.accuracy, 'road_level');
  assert.equal(result.latitude, 16.692);
  assert.match(result.label, /Approximate road-level/);
});

test('Santiago and Calao East use the existing barangay representative coordinate', async () => {
  const result = await resolveNewsCorrectionLocation({
    extractedMunicipality: 'Santiago City',
    extractedBarangay: 'Calao East',
    rawPayload: { location: { road: 'road / unspecified' } },
  }, {
    barangays: [{ name: 'Calao East', municipality: 'Santiago', centroid: { type: 'Point', coordinates: [121.5875, 16.6875] } }],
    geocode: noGeocode,
    resolveBarangay: noGeometry,
  });

  assert.equal(result.source, 'barangay_centroid');
  assert.equal(result.approximate, true);
  assert.equal(result.latitude, 16.6875);
  assert.match(result.label, /Calao East, Santiago/);
});

test('municipality-only records fall back to a municipality center', async () => {
  const result = await resolveNewsCorrectionLocation({
    extractedMunicipality: 'Santiago',
  }, {
    barangays: [
      { name: 'A', municipality: 'Santiago', centroid: 'POINT(121.58 16.68)' },
      { name: 'B', municipality: 'Santiago City', centroid: 'POINT(121.60 16.70)' },
    ],
    geocode: noGeocode,
    resolveMunicipality: noGeometry,
  });

  assert.equal(result.source, 'municipality_center');
  assert.equal(result.approximate, true);
  assert.ok(Math.abs(result.latitude - 16.69) < 0.000001);
  assert.ok(Math.abs(result.longitude - 121.59) < 0.000001);
  assert.match(result.label, /Santiago/);
});

test('unmatched records do not fabricate a default incident coordinate', async () => {
  const result = await resolveNewsCorrectionLocation({}, {
    geocode: noGeocode,
    resolveBarangay: noGeometry,
    resolveMunicipality: noGeometry,
  });

  assert.equal(result.source, 'unmapped');
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.equal(result.approximate, true);
});
