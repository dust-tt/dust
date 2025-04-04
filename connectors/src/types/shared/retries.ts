import type { LoggerInterface } from "@dust-tt/client";

import { setTimeoutAsync } from "@connectors/lib/async_utils";
import { normalizeError } from "@connectors/types/api";

type RetryOptions = {
  retries?: number;
  delayBetweenRetriesMs?: number;
};

export function withRetries<T, U>(
  logger: LoggerInterface,
  fn: (arg: T) => Promise<U>,
  { retries = 10, delayBetweenRetriesMs = 1000 }: RetryOptions = {}
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
        const sleepTime = delayBetweenRetriesMs * (i + 1) ** 2;
        logger.warn(
          {
            error: e,
            attempt: i + 1,
            retries: retries,
            sleepTime: sleepTime,
          },
          "Error while executing retriable function. Retrying..."
        );

        await setTimeoutAsync(sleepTime);

        errors.push({ attempt: i + 1, error: e });
      }
    }

    const errorMessage = `Function failed after ${retries} attempts:\n${errors
      .map(
        ({ attempt, error }) => `Attempt ${attempt}: ${normalizeError(error)}`
      )
      .join("\n")}`;

    throw new Error(errorMessage);
  };
}
