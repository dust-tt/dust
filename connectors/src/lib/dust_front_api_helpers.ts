import logger from "@connectors/logger/logger";

type RetryOptions = {
  retries?: number;
  delayBetweenRetriesMs?: number;
};

export function withRetries<T, U>(
  fn: (arg: T) => Promise<U>,
  { retries = 10, delayBetweenRetriesMs = 1000 }: RetryOptions = {}
): (arg: T & RetryOptions) => Promise<U> {
  if (retries < 1) {
    throw new Error("retries must be >= 1");
  }
  return async (arg) => {
    const errors = [];
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
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
        errors.push(e);
      }
    }

    throw new Error(errors.join("\n"));
  };
}
