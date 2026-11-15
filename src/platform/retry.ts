export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  /** Return true when the error is worth retrying (rate limits, 5xx, network). */
  retryable?: (err: unknown) => boolean;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body = '',
  ) {
    super(message);
  }
}

export const isTransient = (err: unknown): boolean => {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseMs ?? 400;
  const retryable = opts.retryable ?? isTransient;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !retryable(err)) break;
      await sleep(base * 2 ** i + Math.floor(Math.random() * base));
    }
  }
  throw lastErr;
}
