import {
  RequestTimeoutError,
  UnknownHTTPResponseError,
} from "@notionhq/client";
import { APIErrorCode, APIResponseError } from "@notionhq/client";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { ApplicationFailure } from "@temporalio/common";

import { ProviderWorkflowError } from "@connectors/lib/error";

export class NotionCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  // Delay retries for Notion transient 5xx by ~30 minutes to avoid hot-looping.
  private static readonly TRANSIENT_RETRY_DELAY_MS = 30 * 60 * 1000;

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (APIResponseError.isAPIResponseError(err)) {
        switch (err.code) {
          case APIErrorCode.ServiceUnavailable:
            throw new ProviderWorkflowError(
              "notion",
              "Service Unavailable",
              "transient_upstream_activity_error",
              err
            );

          case APIErrorCode.RateLimited:
            throw new ProviderWorkflowError(
              "notion",
              "Rate Limit Error",
              "rate_limit_error",
              err
            );

          case APIErrorCode.InternalServerError:
            throw new ProviderWorkflowError(
              "notion",
              "Internal Server Error",
              "transient_upstream_activity_error",
              err
            );
          case APIErrorCode.ValidationError:
            throw new ProviderWorkflowError(
              "notion",
              "Validation Error",
              "transient_upstream_activity_error",
              err
            );
        }
      } else if (UnknownHTTPResponseError.isUnknownHTTPResponseError(err)) {
        if ([502, 504, 530].includes(err.status)) {
          // Notion transient upstream errors: force Temporal to wait ~30 minutes before retrying.
          throw ApplicationFailure.create({
            message: `Notion ${err.status} - Transient upstream error. Retry after ${NotionCastKnownErrorsInterceptor.TRANSIENT_RETRY_DELAY_MS / 1000}s`,
            type: "transient_upstream_activity_error",
            nextRetryDelay: NotionCastKnownErrorsInterceptor.TRANSIENT_RETRY_DELAY_MS,
          });
        }
      } else if (RequestTimeoutError.isRequestTimeoutError(err)) {
        throw new ProviderWorkflowError(
          "notion",
          "Request Timeout",
          "transient_upstream_activity_error",
          err
        );
      }

      throw err;
    }
  }
}
