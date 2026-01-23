import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { GaxiosError } from "googleapis-common";

import {
  ExternalOAuthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";

const OAUTH_ERROR_REASONS = new Set(["insufficientPermissions"]);

function isObjectWithError(
  data: unknown
): data is { error: { errors: unknown } } {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "object" &&
    data.error !== null &&
    "errors" in data.error
  );
}

function isErrorWithReason(err: unknown): err is { reason: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "reason" in err &&
    typeof err.reason === "string"
  );
}

function isGoogleDriveInsufficientPermissionsError(
  err: unknown
): err is GaxiosError {
  if (!(err instanceof GaxiosError)) {
    return false;
  }

  const status = err.response?.status;
  if (status !== 401 && status !== 403) {
    return false;
  }

  const data: unknown = err.response?.data;
  if (!isObjectWithError(data)) {
    return false;
  }

  const errors = data.error.errors;
  if (!Array.isArray(errors)) {
    return false;
  }

  return errors.some(
    (e) => isErrorWithReason(e) && OAUTH_ERROR_REASONS.has(e.reason)
  );
}

export class GoogleDriveCastKnownErrorsInterceptor implements ActivityInboundCallsInterceptor {
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (isGoogleDriveInsufficientPermissionsError(err)) {
        throw new ExternalOAuthTokenError(err);
      }

      if (err instanceof GaxiosError) {
        switch (err.response?.status) {
          case 429:
            throw new ProviderWorkflowError(
              "google_drive",
              "429: Rate Limit Error",
              "rate_limit_error",
              err
            );

          case 500:
            throw new ProviderWorkflowError(
              "google_drive",
              "500 - Internal Error",
              "transient_upstream_activity_error",
              err
            );
        }
      }

      throw err;
    }
  }
}
