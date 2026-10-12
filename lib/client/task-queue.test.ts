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

  it("pause() stops new tasks, resume() continues, pushFront() goes first", async () => {
    const queue = new TaskQueue(1);
    const order: string[] = [];
    const task = (name: string) => async () => {
      order.push(name);
      await tick();
    };
    queue.pause();
    queue.push(task("a"));
    queue.push(task("b"));
    await tick(20);
    expect(order).toEqual([]);
    queue.pushFront(task("retry"));
    queue.resume();
    await tick(60);
    expect(order).toEqual(["retry", "a", "b"]);
  });

  it("lets running tasks finish while paused", async () => {
    const queue = new TaskQueue(2);
    const done: string[] = [];
    queue.push(async () => {
      await tick(10);
      done.push("running");
    });
    queue.push(async () => {
      done.push("second");
    });
    queue.pause();
    queue.push(async () => {
      done.push("later");
    });
    await tick(30);
    expect(done).toEqual(["second", "running"]);
    queue.resume();
    await tick(10);
    expect(done).toEqual(["second", "running", "later"]);
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
