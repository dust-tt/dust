import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

interface SnowflakeExpiredPasswordError extends Error {
  code: number;
  name: string;
}

function isSnowflakeExpiredPasswordError(
  err: unknown
): err is SnowflakeExpiredPasswordError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === 390106 // this is the magic code number for an expired password error, the message says "Specified password has expired.  Password must be changed using the Snowflake web console."
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
