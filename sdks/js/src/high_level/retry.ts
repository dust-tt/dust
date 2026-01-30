export interface RetryDelayOptions {
  initialMs: number;
  maxMs: number;
  multiplier: number;
}

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: Partial<RetryDelayOptions>;
}

export interface ResolvedRetryOptions {
  maxRetries: number;
  retryDelay: RetryDelayOptions;
}

export const DEFAULT_RETRY_DELAY: RetryDelayOptions = {
  initialMs: 500,
  maxMs: 30000,
  multiplier: 2,
};

export const DEFAULT_RETRY_OPTIONS: ResolvedRetryOptions = {
  maxRetries: 2,
  retryDelay: DEFAULT_RETRY_DELAY,
};

export function resolveRetryOptions(
  base: ResolvedRetryOptions,
  override?: RetryOptions
): ResolvedRetryOptions {
  return {
    maxRetries: override?.maxRetries ?? base.maxRetries,
    retryDelay: {
      initialMs: override?.retryDelay?.initialMs ?? base.retryDelay.initialMs,
      maxMs: override?.retryDelay?.maxMs ?? base.retryDelay.maxMs,
      multiplier:
        override?.retryDelay?.multiplier ?? base.retryDelay.multiplier,
    },
  };
}
