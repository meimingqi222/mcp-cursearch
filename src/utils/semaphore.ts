export class Semaphore {
  private max: number;
  private counter = 0;
  private waiting: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];
  private abortSignal: AbortSignal;

  constructor(max: number, abortSignal?: AbortSignal) {
    this.max = max;
    this.abortSignal = abortSignal || new AbortController().signal;
  }

  private take() {
    if (this.waiting.length > 0 && this.counter < this.max) {
      this.counter++;
      const w = this.waiting.shift();
      w && w.resolve();
    }
  }

  acquire(): Promise<void> {
    if (this.counter < this.max) {
      this.counter++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
    });
  }

  release() {
    this.counter--;
    this.take();
  }

  async withSemaphore<T>(fn: () => Promise<T>, onTiming?: (ms: number) => void): Promise<T> {
    await this.acquire();
    const start = Date.now();
    try {
      if (this.abortSignal.aborted) return Promise.reject("Aborted") as unknown as T;
      return await fn();
    } finally {
      this.release();
      if (onTiming) onTiming(Date.now() - start);
    }
  }

  async withRetrySemaphore<T>(fn: () => Promise<T>, onTiming?: (ms: number) => void, retries = 3): Promise<T> {
    if (this.abortSignal.aborted) return Promise.reject("Aborted") as unknown as T;
    for (let i = 1; i < retries; i++) {
      try { return await this.withSemaphore(fn, onTiming); } catch {
        await new Promise((r) => setTimeout(r, 200 * i));
      }
    }
    return this.withSemaphore(fn, onTiming);
  }
}


