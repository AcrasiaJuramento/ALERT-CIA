import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLoginAllowed,
  clearLoginRateLimit,
  getLoginRateLimitStatus,
  loginRateLimitConfig,
  recordFailedLogin,
} from './loginRateLimit.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('locks an officer login after repeated failed attempts', () => {
  const storage = createStorage();
  const email = 'Officer@MDRRMO.gov.ph';
  const now = 1_000;

  for (let index = 0; index < loginRateLimitConfig.maxFailedAttempts - 1; index += 1) {
    recordFailedLogin(email, { storage, now });
    assert.equal(getLoginRateLimitStatus(email, { storage, now }).limited, false);
  }

  recordFailedLogin(email, { storage, now });
  const status = getLoginRateLimitStatus(email.toLowerCase(), { storage, now });
  assert.equal(status.limited, true);
  assert.equal(status.remainingMs, loginRateLimitConfig.lockoutMs);
  assert.throws(() => assertLoginAllowed(email, { storage, now }), /Too many failed sign-in attempts/);
});

test('clears login rate limit after the lockout expires or a successful login', () => {
  const storage = createStorage();
  const email = 'officer@mdrrmo.gov.ph';
  const now = 10_000;

  for (let index = 0; index < loginRateLimitConfig.maxFailedAttempts; index += 1) {
    recordFailedLogin(email, { storage, now });
  }
  assert.equal(getLoginRateLimitStatus(email, { storage, now }).limited, true);

  const afterLockout = now + loginRateLimitConfig.lockoutMs + 1;
  assert.equal(getLoginRateLimitStatus(email, { storage, now: afterLockout }).limited, false);

  for (let index = 0; index < loginRateLimitConfig.maxFailedAttempts; index += 1) {
    recordFailedLogin(email, { storage, now });
  }
  clearLoginRateLimit(email, { storage });
  assert.equal(getLoginRateLimitStatus(email, { storage, now }).limited, false);
});
