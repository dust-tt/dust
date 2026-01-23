import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { GaxiosError } from "googleapis-common";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

export class BigQueryCastKnownErrorsInterceptor implements ActivityInboundCallsInterceptor {
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (err instanceof GaxiosError) {
        // Check for invalid_grant error which indicates the account/authorization is no longer valid
        if (
          err.response?.data &&
          typeof err.response.data === "object" &&
          "error" in err.response.data &&
          err.response.data.error === "invalid_grant"
        ) {
          throw new ExternalOAuthTokenError(err);
        }

        // Also check for 401 status which indicates authentication failure
        if (err.response?.status === 401) {
          throw new ExternalOAuthTokenError(err);
        }
      }

      // Check if the error message contains invalid_grant
      if (
        err instanceof Error &&
        err.message.includes("invalid_grant: Invalid grant: account not found")
      ) {
        throw new ExternalOAuthTokenError(err);
      }

      throw err;
    }
  }
}
