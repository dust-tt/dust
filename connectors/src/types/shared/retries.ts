import type { LoggerInterface } from "@dust-tt/client";
import { AxiosError } from "axios";

import { setTimeoutAsync } from "@connectors/lib/async_utils";
import {
  DataSourceQuotaExceededError,
  WorkspaceQuotaExceededError,
} from "@connectors/lib/error";
import { normalizeError } from "@connectors/types/api";

export class WithRetriesError extends Error {
  // Additional context to each error that will appear in the logs, unlike the whole error.
  readonly additionalContext: Record<string, unknown>[];

  constructor(
    readonly errors: {
      attempt: number;
      error: unknown;
      additionalContext: Record<string, unknown>;
    }[],
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
    this.additionalContext = errors.map((e) => e.additionalContext);
    this.retries = retries;
    this.delayBetweenRetriesMs = delayBetweenRetriesMs;
  }
}

type RetryOptions = {
  retries?: number;
  delayBetweenRetriesMs?: number;
  // Return true to retry on this error, false to stop and rethrow.
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

export function withRetries<Args extends unknown[], Return>(
  logger: LoggerInterface,
  fn: (...args: Args) => Promise<Return>,
  { retries = 10, delayBetweenRetriesMs = 1000, shouldRetry }: RetryOptions = {}
): (...args: Args) => Promise<Return> {
  if (retries < 1) {
    throw new Error("retries must be >= 1");
  }

  return async (...args) => {
    const errors: {
      attempt: number;
      error: unknown;
      additionalContext: Record<string, unknown>;
    }[] = [];

    for (let i = 0; i < retries; i++) {
      const attempt = i + 1;
      try {
        return await fn(...args);
      } catch (e) {
        let additionalContext = {};
        if (e instanceof AxiosError) {
          additionalContext = {
            url: e.config?.url,
            code: e.code,
            status: e.status,
          };
        }
        if (
          e instanceof AxiosError &&
          e.code === "ERR_BAD_REQUEST" &&
          e.status === 403
        ) {
          const errorType = e.response?.data?.error?.type;

          if (errorType === "workspace_quota_error") {
            // This error will pause the connector.
            throw new WorkspaceQuotaExceededError();
          }

          if (errorType === "data_source_quota_error") {
            // This error is per file and will NOT pause the connector (important!).
            throw new DataSourceQuotaExceededError();
          }
        }
        // If a predicate is provided and returns false, do not retry.
        if (shouldRetry && !shouldRetry(e, attempt)) {
          throw e;
        }
        const sleepTime = delayBetweenRetriesMs * (i + 1) ** 2;
        logger.warn(
          {
            error: e,
            attempt: attempt,
            retries: retries,
            sleepTime: sleepTime,
          },
          "Error while executing retriable function. Retrying..."
        );

        await setTimeoutAsync(sleepTime);

        errors.push({ attempt: attempt, error: e, additionalContext });
      }
    }

    throw new WithRetriesError(errors, retries, delayBetweenRetriesMs);
  };
}
