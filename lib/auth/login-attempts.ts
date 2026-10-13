// In-memory brute-force protection, per client IP. Memory is enough for a single server; a
// restart clears all locks.
// - Every wrong login slows the next one down: 1s, 2s, 4s, 8s, then 10s each.
// - 10 wrong logins within 15 minutes lock that IP for 5 minutes.
// The whole office shares one public IP behind Cloudflare, so the lock is short and the
// threshold generous: one person mistyping must not shut everyone out for long. The delay
// keeps guessing slow anyway, and the shared password is long and random (README).

export const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 5 * 60 * 1000;
const FIRST_DELAY_MS = 1000;
export const MAX_DELAY_MS = 10_000;
const PRUNE_THRESHOLD = 10_000;

interface AttemptState {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
  /** Before this, a new attempt from the IP waits (the delay after the last failure). */
  nextAttemptAt: number;
}

const globalForAttempts = globalThis as typeof globalThis & {
  __podQaLoginAttempts?: Map<string, AttemptState>;
};

function attempts(): Map<string, AttemptState> {
  globalForAttempts.__podQaLoginAttempts ??= new Map();
  return globalForAttempts.__podQaLoginAttempts;
}

/** Delay after the n-th consecutive failure: 1s, 2s, 4s, 8s, then 10s. */
export function failureDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** (failures - 1));
}

export function getLockRemainingMs(ip: string, now = Date.now()): number {
  const state = attempts().get(ip);
  return state && state.lockedUntil > now ? state.lockedUntil - now : 0;
}

/** How long a new attempt from this IP must wait before being checked (0 if none). */
export function getAttemptWaitMs(ip: string, now = Date.now()): number {
  const state = attempts().get(ip);
  return state && state.nextAttemptAt > now ? Math.min(state.nextAttemptAt - now, MAX_DELAY_MS) : 0;
}

export interface FailureResult {
  /** > 0 when this failure triggered a lock. */
  lockedForMs: number;
  remainingAttempts: number;
  /** How long to hold the response for this failure. */
  delayMs: number;
}

export function recordFailure(ip: string, now = Date.now()): FailureResult {
  const map = attempts();
  const previous = map.get(ip);
  const state: AttemptState =
    previous && now - previous.lastFailureAt <= WINDOW_MS
      ? previous
      : { failures: 0, lastFailureAt: now, lockedUntil: 0, nextAttemptAt: 0 };

  state.failures += 1;
  state.lastFailureAt = now;
  const delayMs = failureDelayMs(state.failures);
  state.nextAttemptAt = now + delayMs;

  let lockedForMs = 0;
  const remainingAttempts = Math.max(0, MAX_FAILURES - state.failures);
  if (state.failures >= MAX_FAILURES) {
    state.failures = 0;
    state.lockedUntil = now + LOCK_MS;
    lockedForMs = LOCK_MS;
  }

  map.set(ip, state);
  if (map.size > PRUNE_THRESHOLD) prune(map, now);

  return { lockedForMs, remainingAttempts, delayMs };
}

export function clearFailures(ip: string): void {
  attempts().delete(ip);
}

function prune(map: Map<string, AttemptState>, now: number): void {
  for (const [ip, state] of map) {
    if (state.lockedUntil <= now && now - state.lastFailureAt > WINDOW_MS) map.delete(ip);
  }
}
