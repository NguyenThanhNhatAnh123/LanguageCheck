// Limits concurrent Claude calls across all users (CLAUDE_MAX_CONCURRENCY).

export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    this.waiting.shift()?.();
  }
}

// One shared instance per process, kept on globalThis so dev hot reload does not reset it.
const globalForSemaphore = globalThis as typeof globalThis & {
  __podQaClaudeSemaphore?: { limit: number; semaphore: Semaphore };
};

export function getClaudeSemaphore(limit: number): Semaphore {
  const current = globalForSemaphore.__podQaClaudeSemaphore;
  if (current && current.limit === limit) return current.semaphore;
  const semaphore = new Semaphore(limit);
  globalForSemaphore.__podQaClaudeSemaphore = { limit, semaphore };
  return semaphore;
}
