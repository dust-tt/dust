import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

interface SnowflakeExpiredPasswordError extends Error {
  code: number;
  name: "OperationFailedError";
  data: {
    nextAction: "PWD_CHANGE";
  };
}

function isSnowflakeExpiredPasswordError(
  err: unknown
): err is SnowflakeExpiredPasswordError {
  return (
    err instanceof Error &&
    err.name === "OperationFailedError" &&
    "data" in err &&
    typeof err.data === "object" &&
    err.data !== null &&
    "nextAction" in err.data &&
    err.data.nextAction === "PWD_CHANGE"
  );
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
      if (isSnowflakeExpiredPasswordError(err)) {
        throw new ExternalOAuthTokenError(err);
      }
      throw err;
    }
  }
}
