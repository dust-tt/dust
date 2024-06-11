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

import { ProviderWorkflowError } from "@connectors/lib/error";

export class NotionCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
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
              "Notion service is unavailable",
              "notion",
              err
            );

          case APIErrorCode.RateLimited:
            throw new ProviderWorkflowError(
              "Notion rate limited",
              "notion",
              err
            );

          case APIErrorCode.InternalServerError:
            throw new ProviderWorkflowError(
              "Notion internal server error",
              "notion",
              err
            );
        }
      } else if (UnknownHTTPResponseError.isUnknownHTTPResponseError(err)) {
        if ([502, 504, 530].includes(err.status)) {
          // Sometimes notion returns 502/504s, they are transient and look like rate limiting
          // errors. 530 is transient and looks like DNS errors.
          throw new ProviderWorkflowError(
            "Notion 5XX transient error",
            "notion",
            err
          );
        }
      } else if (RequestTimeoutError.isRequestTimeoutError(err)) {
        throw new ProviderWorkflowError(
          "Notion request timeout",
          "notion",
          err
        );
      }

      throw err;
    }
  }
}
