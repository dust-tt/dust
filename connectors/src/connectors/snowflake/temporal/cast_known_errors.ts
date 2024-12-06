import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

interface SnowflakeError extends Error {
  code: number;
  name: string;
  data: {
    nextAction: string;
  };
}

interface SnowflakeExpiredPasswordError extends SnowflakeError {
  name: "OperationFailedError";
  data: {
    nextAction: "PWD_CHANGE";
  };
}

interface SnowflakeAccountLockedError extends SnowflakeError {
  name: "OperationFailedError";
  data: {
    nextAction: "RETRY_LOGIN";
  };
}

function isSnowflakeError(err: unknown): err is SnowflakeError {
  return (
    err instanceof Error &&
    "code" in err &&
    typeof err.code === "number" &&
    "name" in err &&
    typeof err.name === "string" &&
    "data" in err &&
    typeof err.data === "object" &&
    err.data !== null &&
    "nextAction" in err.data &&
    typeof err.data.nextAction === "string"
  );
}

function isSnowflakeExpiredPasswordError(
  err: unknown
): err is SnowflakeExpiredPasswordError {
  return isSnowflakeError(err) && err.data.nextAction === "PWD_CHANGE";
}

function isSnowflakeAccountLockedError(
  err: unknown
): err is SnowflakeAccountLockedError {
  return isSnowflakeError(err) && err.data.nextAction === "RETRY_LOGIN";
}

export class SnowflakeCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (
        isSnowflakeExpiredPasswordError(err) ||
        isSnowflakeAccountLockedError(err)
      ) {
        throw new ExternalOAuthTokenError(err);
      }
      throw err;
    }
  }
}
