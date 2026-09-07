import {
  ExternalOAuthTokenError,
  ThirdPartyConfigurationError,
} from "@connectors/lib/error";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { GaxiosError } from "googleapis-common";

function isBigQueryPolicyViolationError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    "code" in err &&
    err.code === 403 &&
    "errors" in err &&
    Array.isArray(err.errors) &&
    err.errors.some(
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "reason" in error &&
        error.reason === "policyViolation"
    )
  );
}

export class BigQueryCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  /**
   * @cc [label:error-handling] bigquery-error-classification
   * Map recognized authentication and provider configuration failures to `ExternalOAuthTokenError`
   * and `ThirdPartyConfigurationError`, respectively. Return successful activity results and rethrow
   * unrecognized errors unchanged.
   */
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

      if (isBigQueryPolicyViolationError(err)) {
        throw new ThirdPartyConfigurationError(err);
      }

      throw err;
    }
  }
}
