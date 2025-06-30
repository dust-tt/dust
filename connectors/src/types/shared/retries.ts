import type { LoggerInterface } from "@dust-tt/client";

import { setTimeoutAsync } from "@connectors/lib/async_utils";
import { normalizeError } from "@connectors/types/api";

export class WithRetriesError extends Error {
  constructor(
    readonly errors: Array<{ attempt: number; error: unknown }>,
    readonly retries: number,
    readonly delayBetweenRetriesMs: number
  ) {
    const message = `Function failed after ${retries} attempts:\n${errors
      .map(
        ({ attempt, error }) => `Attempt ${attempt}: ${normalizeError(error)}`
      )
      .join("\n")}`;

    super(message);
    this.name = "WithRetriesError";
    this.retries = retries;
    this.delayBetweenRetriesMs = delayBetweenRetriesMs;
  }
}

type RetryOptions = {
  retries?: number;
  delayBetweenRetriesMs?: number;
  shouldRetryIf?: (error: Error) => boolean;
};

export function withRetries<T, U>(
  logger: LoggerInterface,
  fn: (arg: T) => Promise<U>,
  {
    retries = 10,
    delayBetweenRetriesMs = 1000,
    shouldRetryIf = () => true,
  }: RetryOptions = {}
): (arg: T & RetryOptions) => Promise<U> {
  if (retries < 1) {
    throw new Error("retries must be >= 1");
  }

  return async (arg) => {
    const errors: Array<{ attempt: number; error: unknown }> = [];

    for (let i = 0; i < retries; i++) {
      try {
        return await fn(arg);
      } catch (e) {
        errors.push({ attempt: i + 1, error: e });
        const shouldRetry = shouldRetryIf(normalizeError(e));
        const sleepTime = delayBetweenRetriesMs * (i + 1) ** 2;
        logger.warn(
          {
            error: e,
            attempt: i + 1,
            retries,
            shouldRetry,
            sleepTime,
          },
          "Error while executing retriable function. Retrying..."
        );
        if (!shouldRetry) {
          break;
        }

        await setTimeoutAsync(sleepTime);
      }
    }

    throw new WithRetriesError(errors, retries, delayBetweenRetriesMs);
  };
}
