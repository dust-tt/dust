import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import { clampRetryAfterMs } from "@connectors/connectors/gong/lib/gong_api";
import {
  DustConnectorWorkflowError,
  ProviderRateLimitError,
} from "@connectors/lib/error";
import { ApplicationFailure } from "@temporalio/common";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

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
          case 429: {
            const clampedMs = clampRetryAfterMs(err.retryAfterMs);
            if (clampedMs !== undefined) {
              // Override the default retry delay of the activity policy.
              throw ApplicationFailure.create({
                message: `${err.message}. Retry after ${clampedMs}ms`,
                nextRetryDelay: clampedMs,
                cause: err,
              });
            }

            throw new ProviderRateLimitError(
              "gong",
              "429 - Rate Limit Exceeded (no Retry-After)",
              err
            );
          }

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
