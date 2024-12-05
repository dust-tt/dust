import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

interface SnowflakeApiError extends Error {
  code: number;
  name: string;
}

function isExpiredPasswordError(err: unknown): err is SnowflakeApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === 390106
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
      if (isExpiredPasswordError(err)) {
        throw new ExternalOAuthTokenError(err);
      }
      throw err;
    }
  }
}
