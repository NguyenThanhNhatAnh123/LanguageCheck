/** Runs async tasks with at most `concurrency` in flight (the client allows 4 uploads at once). */
export class TaskQueue {
  private running = 0;
  private readonly pending: Array<() => Promise<void>> = [];

  constructor(private readonly concurrency: number) {}

  push(task: () => Promise<void>): void {
    this.pending.push(task);
    this.pump();
  }

  /** Drops tasks that have not started yet; running ones finish (or get aborted by the caller). */
  clear(): void {
    this.pending.length = 0;
  }

  get runningCount(): number {
    return this.running;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const task = this.pending.shift();
      if (!task) return;
      this.running += 1;
      void task()
        .catch(() => {
          // Tasks report their own failures; a throw must not stall the queue.
        })
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }
}
