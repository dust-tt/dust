import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import {
  isZendeskExpiredCursorError,
  isZendeskForbiddenError,
} from "@connectors/connectors/zendesk/lib/errors";
import {
  DustConnectorWorkflowError,
  ExternalOAuthTokenError,
} from "@connectors/lib/error";

export class ZendeskCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (isZendeskForbiddenError(err)) {
        throw new ExternalOAuthTokenError(err);
      } else if (isZendeskExpiredCursorError(err)) {
        throw new DustConnectorWorkflowError(
          "Cursor expired",
          "unhandled_internal_activity_error",
          err
        );
      }

      throw err;
    }
  }
}
