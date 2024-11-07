import axios from "axios";

import logger from "@connectors/logger/logger";

type RetryOptions = {
  retries?: number;
  delayBetweenRetriesMs?: number;
};

function sanitizeError(error: unknown) {
  if (axios.isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data
        ? JSON.stringify(error.response.data)
        : undefined,
      url: error.config?.url,
      method: error.config?.method,
    };
  }
  return error;
}

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
        const sanitizedError = sanitizeError(e);

        const sleepTime = delayBetweenRetriesMs * (i + 1) ** 2;
        logger.warn(
          {
            error: sanitizedError,
            attempt: i + 1,
            retries: retries,
            sleepTime: sleepTime,
          },
          "Error while executing retriable function. Retrying..."
        );

        errors.push(sanitizedError);

        await new Promise((resolve) => setTimeout(resolve, sleepTime));
      }
    }

    throw new Error(errors.join("\n"));
  };
}
