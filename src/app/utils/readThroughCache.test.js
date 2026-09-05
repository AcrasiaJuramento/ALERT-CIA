import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadThroughCache } from './readThroughCache.js';

test('shared reads coalesce, return isolated data, and expire', async () => {
  let clock = 0, calls = 0;
  const cache = createReadThroughCache({ now: () => clock });
  const loader = async () => { calls++; return [{ id: 1 }]; };
  const [a, b] = await Promise.all([cache.read('map', loader, 100), cache.read('map', loader, 100)]);
  assert.equal(calls, 1);
  a[0].id = 2;
  assert.equal(b[0].id, 1);
  await cache.read('map', loader, 100);
  assert.equal(calls, 1);
  clock = 101;
  await cache.read('map', loader, 100);
  assert.equal(calls, 2);
});

test('an administrator invalidation prevents old in-flight data repopulating cache', async () => {
  const cache = createReadThroughCache();
  let complete;
  const old = cache.read('map', () => new Promise(resolve => { complete = resolve; }), 1000);
  await Promise.resolve();
  cache.invalidate();
  assert.equal(await cache.read('map', async () => 'published', 1000), 'published');
  complete('draft');
  await old;
  assert.equal(await cache.read('map', async () => 'wrong', 1000), 'published');
});

test('failed requests do not poison the cache', async () => {
  const cache = createReadThroughCache();
  await assert.rejects(cache.read('map', async () => { throw Error('offline'); }, 1000));
  assert.equal(await cache.read('map', async () => 'restored', 1000), 'restored');
});
