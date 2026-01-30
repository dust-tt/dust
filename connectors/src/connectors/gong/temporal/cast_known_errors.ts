import { ApplicationFailure } from "@temporalio/common";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import { DustConnectorWorkflowError } from "@connectors/lib/error";

export class GongCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (err instanceof GongAPIError) {
        switch (err.status) {
          case 429:
            if (err.retryAfterMs) {
              // Override the default retry delay of the activity policy.
              throw ApplicationFailure.create({
                message: `${err.message}. Retry after ${err.retryAfterMs}ms`,
                nextRetryDelay: err.retryAfterMs,
                cause: err,
              });
            }

            throw new DustConnectorWorkflowError(
              "429 - Rate Limit Exceeded",
              "rate_limit_error",
              err
            );

          case 400: {
            const isExpiredCursorError =
              Array.isArray(err.errors) &&
              err.errors.some((e) =>
                e.toLowerCase().includes("cursor has expired")
              );

            if (isExpiredCursorError) {
              // Classify for monitoring parity with other connectors (e.g., Zendesk).
              throw new DustConnectorWorkflowError(
                "Cursor expired",
                "unhandled_internal_activity_error",
                err
              );
            }

            break;
          }

          default:
            throw err;
        }
      }

      throw err;
    }
  }
}
