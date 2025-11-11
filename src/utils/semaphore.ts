import { logger } from "./logger.js";

export interface RetryConfig {
  retries?: number;
  delayMs?: number;
  logRetries?: boolean;
  operationName?: string;
}

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

  async withRetrySemaphore<T>(
    fn: () => Promise<T>,
    onTiming?: (ms: number) => void,
    retries = 3,
    config?: RetryConfig
  ): Promise<T> {
    if (this.abortSignal.aborted) return Promise.reject("Aborted") as unknown as T;

    const maxRetries = config?.retries ?? retries;
    const delayMs = config?.delayMs ?? 200;
    const logRetries = config?.logRetries ?? false;
    const operationName = config?.operationName ?? "operation";

    let lastError: any = null;
    let attemptNumber = 0;

    for (let i = 1; i < maxRetries; i++) {
      attemptNumber = i;
      try {
        const result = await this.withSemaphore(fn, onTiming);
        // Success after retry
        if (logRetries && i > 1) {
          logger.info(
            `✅ ${operationName} succeeded on attempt ${i}/${maxRetries}`
          );
        }
        return result;
      } catch (error) {
        lastError = error;
        const waitTime = delayMs * i;

        if (logRetries) {
          logger.warn(
            `⚠️  ${operationName} failed (attempt ${i}/${maxRetries}). ` +
            `Retrying in ${waitTime}ms...`
          );
        }

        await new Promise((r) => setTimeout(r, waitTime));
      }
    }

    // Final attempt
    attemptNumber = maxRetries;
    if (logRetries && maxRetries > 1) {
      logger.info(
        `🔄 ${operationName} attempting final try (attempt ${maxRetries}/${maxRetries})...`
      );
    }

    try {
      const result = await this.withSemaphore(fn, onTiming);
      // Success on final attempt
      if (logRetries && maxRetries > 1) {
        logger.info(
          `✅ ${operationName} succeeded on final attempt ${maxRetries}/${maxRetries}`
        );
      }
      return result;
    } catch (error) {
      if (logRetries) {
        // Log simple error message without verbose JSON details
        logger.error(
          `❌ ${operationName} failed after ${maxRetries} attempts. Giving up.`
        );
      }
      throw error;
    }
  }
}


