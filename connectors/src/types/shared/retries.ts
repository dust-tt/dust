import type { LoggerInterface } from "@dust-tt/client";
import { AxiosError } from "axios";

import { setTimeoutAsync } from "@connectors/lib/async_utils";
import {
  DataSourceQuotaExceededError,
  WorkspaceQuotaExceededError,
} from "@connectors/lib/error";
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
};

export function withRetries<Args extends unknown[], Return>(
  logger: LoggerInterface,
  fn: (...args: Args) => Promise<Return>,
  { retries = 10, delayBetweenRetriesMs = 1000 }: RetryOptions = {}
): (...args: Args) => Promise<Return> {
  if (retries < 1) {
    throw new Error("retries must be >= 1");
  }

  return async (...args) => {
    const errors: Array<{ attempt: number; error: unknown }> = [];

    for (let i = 0; i < retries; i++) {
      try {
        return await fn(...args);
      } catch (e) {
        if (
          e instanceof AxiosError &&
          e.code === "ERR_BAD_REQUEST" &&
          e.status === 403
        ) {
          const errorType = e.response?.data?.error?.type;

          if (errorType === "workspace_quota_error") {
            // This error will pause the connector.
            throw new WorkspaceQuotaExceededError(e);
          }

          if (errorType === "data_source_quota_error") {
            // This error is per file and will NOT pause the connector (important!).
            throw new DataSourceQuotaExceededError(e);
          }
        }

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

    throw new WithRetriesError(errors, retries, delayBetweenRetriesMs);
  };
}
