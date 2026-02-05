import {
  DustCancelledError,
  DustRateLimitError,
  isRetryableError,
} from "../errors";

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableStatuses: number[];
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableStatuses: [408, 429, 502, 503, 504],
};

export interface WithRetryOptions extends Partial<RetryOptions> {
  signal?: AbortSignal;
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DustCancelledError("Operation cancelled");
  }

  return new Promise((resolve, reject) => {
    function onAbort(): void {
      clearTimeout(timeoutId);
      reject(new DustCancelledError("Operation cancelled"));
    }

    signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
  });
}

function calculateDelayWithJitter(
  baseDelay: number,
  jitterFactor: number,
  maxDelay: number
): number {
  const jitter = baseDelay * jitterFactor * (Math.random() * 2 - 1);
  return Math.min(Math.max(0, baseDelay + jitter), maxDelay);
}

function shouldRetry(
  error: unknown,
  customCheck?: (error: unknown) => boolean
): boolean {
  return customCheck ? customCheck(error) : isRetryableError(error);
}

function getRateLimitDelay(error: unknown): number | undefined {
  return error instanceof DustRateLimitError ? error.retryAfterMs : undefined;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: WithRetryOptions = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const { signal, isRetryable: customIsRetryable, onRetry } = options;

  let lastError: unknown = null;
  let currentDelay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new DustCancelledError("Operation cancelled");
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (error instanceof DustCancelledError) {
        throw error;
      }

      if (!shouldRetry(error, customIsRetryable)) {
        throw error;
      }

      if (attempt >= opts.maxAttempts) {
        throw error;
      }

      const rateLimitDelay = getRateLimitDelay(error);
      const delayMs =
        rateLimitDelay ??
        calculateDelayWithJitter(
          currentDelay,
          opts.jitterFactor,
          opts.maxDelayMs
        );

      onRetry?.(error, attempt, delayMs);

      await sleep(delayMs, signal);

      currentDelay = Math.min(
        currentDelay * opts.backoffMultiplier,
        opts.maxDelayMs
      );
    }
  }

  throw lastError;
}

export function createRetry(
  defaultOptions: Partial<RetryOptions>
): <T>(operation: () => Promise<T>, options?: WithRetryOptions) => Promise<T> {
  return <T>(
    operation: () => Promise<T>,
    options: WithRetryOptions = {}
  ): Promise<T> => {
    return withRetry(operation, { ...defaultOptions, ...options });
  };
}
