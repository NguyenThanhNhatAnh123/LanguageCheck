import { beforeEach, describe, expect, it } from "vitest";
import {
  clearFailures,
  failureDelayMs,
  getAttemptWaitMs,
  getLockRemainingMs,
  LOCK_MS,
  MAX_DELAY_MS,
  MAX_FAILURES,
  recordFailure,
} from "./login-attempts";

const IP = "203.0.113.7";

beforeEach(() => {
  clearFailures(IP);
});

describe("failureDelayMs", () => {
  it("doubles from 1s and stops at 10s", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(failureDelayMs)).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000, 10_000]);
    expect(MAX_DELAY_MS).toBe(10_000);
  });
});

describe("recordFailure", () => {
  it("slows every wrong login down and makes the next attempt wait", () => {
    const now = 1_000_000;
    expect(recordFailure(IP, now)).toEqual({ lockedForMs: 0, remainingAttempts: 9, delayMs: 1000 });
    expect(getAttemptWaitMs(IP, now)).toBe(1000);
    expect(getAttemptWaitMs(IP, now + 1000)).toBe(0);
    expect(recordFailure(IP, now + 2000).delayMs).toBe(2000);
    expect(recordFailure(IP, now + 5000).delayMs).toBe(4000);
  });

  it("locks the IP for 5 minutes after 10 wrong logins", () => {
    const now = 2_000_000;
    let last = { lockedForMs: 0, remainingAttempts: MAX_FAILURES, delayMs: 0 };
    for (let i = 0; i < MAX_FAILURES; i++) last = recordFailure(IP, now + i * 1000);
    expect(last.lockedForMs).toBe(LOCK_MS);
    expect(LOCK_MS).toBe(5 * 60 * 1000);
    const lockedAt = now + (MAX_FAILURES - 1) * 1000;
    expect(getLockRemainingMs(IP, lockedAt + 1000)).toBe(LOCK_MS - 1000);
    expect(getLockRemainingMs(IP, lockedAt + LOCK_MS)).toBe(0);
  });

  it("does not lock after 9 wrong logins", () => {
    const now = 3_000_000;
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure(IP, now + i * 1000);
    expect(getLockRemainingMs(IP, now + 10_000)).toBe(0);
  });

  it("forgets failures after a successful login", () => {
    recordFailure(IP, 4_000_000);
    clearFailures(IP);
    expect(getAttemptWaitMs(IP, 4_000_000)).toBe(0);
    expect(recordFailure(IP, 4_000_100).delayMs).toBe(1000);
  });
});
