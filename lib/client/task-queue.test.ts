import { describe, expect, it } from "vitest";
import { TaskQueue } from "./task-queue";

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

describe("TaskQueue", () => {
  it("never runs more than `concurrency` tasks at once and runs them all", async () => {
    const queue = new TaskQueue(4);
    let active = 0;
    let peak = 0;
    let finished = 0;
    for (let i = 0; i < 10; i++) {
      queue.push(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await tick();
        active -= 1;
        finished += 1;
      });
    }
    while (finished < 10) await tick();
    expect(peak).toBe(4);
  });

  it("keeps going after a task throws", async () => {
    const queue = new TaskQueue(1);
    let ran = false;
    queue.push(async () => {
      throw new Error("boom");
    });
    queue.push(async () => {
      ran = true;
    });
    await tick(20);
    expect(ran).toBe(true);
  });

  it("clear() drops tasks that have not started", async () => {
    const queue = new TaskQueue(1);
    const started: number[] = [];
    for (let i = 0; i < 3; i++) {
      queue.push(async () => {
        started.push(i);
        await tick();
      });
    }
    queue.clear();
    await tick(30);
    expect(started).toEqual([0]);
  });
});
