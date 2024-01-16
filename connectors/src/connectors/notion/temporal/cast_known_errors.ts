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
        if (err.code === APIErrorCode.ServiceUnavailable) {
          throw {
            __is_dust_error: true,
            message: err.message,
            type: "notion_service_unavailable",
          };
        }
        if (err.code === APIErrorCode.RateLimited) {
          throw {
            __is_dust_error: true,
            message: err.message,
            type: "notion_rate_limited",
          };
        }
        if (err.code === APIErrorCode.InternalServerError) {
          throw {
            __is_dust_error: true,
            message: err.message,
            type: "notion_internal_server_error",
          };
        }
      } else if (UnknownHTTPResponseError.isUnknownHTTPResponseError(err)) {
        if ([502, 504, 530].includes(err.status)) {
          // Sometimes notion returns 502/504s, they are transient and look like rate limiting
          // errors. 530 is transient and looks like DNS errors.
          throw {
            __is_dust_error: true,
            message: err.message,
            type: "notion_50X_transient_error",
            status_code: err.status,
          };
        }
      } else if (RequestTimeoutError.isRequestTimeoutError(err)) {
        throw {
          __is_dust_error: true,
          message: err.message,
          type: "notion_request_timeout",
        };
      }
      throw err;
    }
  }
}
