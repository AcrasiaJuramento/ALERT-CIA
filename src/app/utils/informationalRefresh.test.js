import { setImmediate } from 'node:timers';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInformationalRefresh } from './informationalRefresh.js';

function harness(refresh) {
  let listener, timer, invalidations = 0;
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_, cb) => { listener = cb; },
    removeEventListener: () => { listener = null; },
  };
  const scheduler = createInformationalRefresh(refresh, {
    document: doc, invalidate: () => invalidations++,
    setTimer: cb => { timer = cb; return 1; }, clearTimer: () => { timer = null; },
  });
  return {
    ...scheduler,
    tick: async () => { const cb = timer; timer = null; cb?.(); await new Promise(resolve => setImmediate(resolve)); },
    visibility: state => { doc.visibilityState = state; listener?.(); },
    get pending() { return Boolean(timer); },
    get invalidations() { return invalidations; },
  };
}

test('realtime bursts produce one delayed informational refresh', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; });
  for (let i = 0; i < 20; i++) h.markStale();
  assert.equal(calls, 0);
  await h.tick();
  assert.equal(calls, 1);
  h.dispose();
});

test('hidden tabs do not fetch and refresh once when made visible', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; });
  h.markStale();
  h.visibility('hidden');
  for (let i = 0; i < 20; i++) h.markStale();
  await h.tick();
  assert.equal(calls, 0);
  assert.equal(h.pending, false);
  h.visibility('visible');
  await h.tick();
  assert.equal(calls, 1);
  h.visibility('visible');
  await h.tick();
  assert.equal(calls, 1);
  h.dispose();
});

test('changes during a refresh schedule one follow-up; disposed screens stop', async () => {
  let finish, calls = 0;
  const h = harness(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  h.markStale();
  await h.tick();
  h.markStale(); h.markStale();
  assert.equal(calls, 1);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.pending, true);
  h.dispose();
  await h.tick();
  h.markStale();
  assert.equal(calls, 1);
});
