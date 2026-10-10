const LOGIN_RATE_LIMIT_PREFIX = 'alert-cia-login-rate-limit:';
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 10 * 60 * 1000;

function storageKey(email) {
  return `${LOGIN_RATE_LIMIT_PREFIX}${String(email || '').trim().toLowerCase()}`;
}

function readState(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null') || {};
  } catch {
    return {};
  }
}

function writeState(storage, key, state) {
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage can fail in private browsing or quota-restricted contexts.
  }
}

function removeState(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Best-effort cleanup only.
  }
}

function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function getLoginRateLimitStatus(email, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (!storage || !email) return { limited: false, remainingMs: 0 };
  const key = storageKey(email);
  const state = readState(storage, key);
  if (!state.lockedUntil || state.lockedUntil <= now) {
    if (state.lockedUntil) removeState(storage, key);
    return { limited: false, remainingMs: 0 };
  }
  return {
    limited: true,
    remainingMs: state.lockedUntil - now,
    message: `Too many failed sign-in attempts. Try again in ${formatWait(state.lockedUntil - now)}.`,
  };
}

export function assertLoginAllowed(email, options) {
  const status = getLoginRateLimitStatus(email, options);
  if (!status.limited) return;
  const error = new Error(status.message);
  error.code = 'LOGIN_RATE_LIMITED';
  error.remainingMs = status.remainingMs;
  throw error;
}

export function recordFailedLogin(email, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (!storage || !email) return;
  const key = storageKey(email);
  const state = readState(storage, key);
  const firstAttemptAt = state.firstAttemptAt && now - state.firstAttemptAt <= ATTEMPT_WINDOW_MS
    ? state.firstAttemptAt
    : now;
  const failedAttempts = firstAttemptAt === state.firstAttemptAt
    ? Number(state.failedAttempts || 0) + 1
    : 1;
  const nextState = {
    firstAttemptAt,
    failedAttempts,
    lockedUntil: failedAttempts >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : null,
  };
  writeState(storage, key, nextState);
}

export function clearLoginRateLimit(email, { storage = globalThis.localStorage } = {}) {
  if (!storage || !email) return;
  removeState(storage, storageKey(email));
}

export const loginRateLimitConfig = {
  maxFailedAttempts: MAX_FAILED_ATTEMPTS,
  attemptWindowMs: ATTEMPT_WINDOW_MS,
  lockoutMs: LOCKOUT_MS,
};
