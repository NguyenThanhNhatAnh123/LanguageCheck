// In-memory brute-force protection: 5 wrong logins within 15 minutes lock that IP for 15 minutes.
// Memory is enough for a single server; a restart clears all locks.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const PRUNE_THRESHOLD = 10_000;

interface AttemptState {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
}

const globalForAttempts = globalThis as typeof globalThis & {
  __podQaLoginAttempts?: Map<string, AttemptState>;
};

function attempts(): Map<string, AttemptState> {
  globalForAttempts.__podQaLoginAttempts ??= new Map();
  return globalForAttempts.__podQaLoginAttempts;
}

export function getLockRemainingMs(ip: string, now = Date.now()): number {
  const state = attempts().get(ip);
  return state && state.lockedUntil > now ? state.lockedUntil - now : 0;
}

export interface FailureResult {
  /** > 0 when this failure triggered a lock. */
  lockedForMs: number;
  remainingAttempts: number;
}

export function recordFailure(ip: string, now = Date.now()): FailureResult {
  const map = attempts();
  const previous = map.get(ip);
  const state: AttemptState =
    previous && now - previous.lastFailureAt <= WINDOW_MS
      ? previous
      : { failures: 0, lastFailureAt: now, lockedUntil: 0 };

  state.failures += 1;
  state.lastFailureAt = now;

  let lockedForMs = 0;
  if (state.failures >= MAX_FAILURES) {
    state.failures = 0;
    state.lockedUntil = now + LOCK_MS;
    lockedForMs = LOCK_MS;
  }

  map.set(ip, state);
  if (map.size > PRUNE_THRESHOLD) prune(map, now);

  return { lockedForMs, remainingAttempts: MAX_FAILURES - state.failures };
}

export function clearFailures(ip: string): void {
  attempts().delete(ip);
}

function prune(map: Map<string, AttemptState>, now: number): void {
  for (const [ip, state] of map) {
    if (state.lockedUntil <= now && now - state.lastFailureAt > WINDOW_MS) map.delete(ip);
  }
}
