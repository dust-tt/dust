import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import {
  isNodeZendeskForbiddenError,
  isZendeskEpipeError,
  isZendeskExpiredCursorError,
} from "@connectors/connectors/zendesk/lib/errors";
import {
  DustConnectorWorkflowError,
  ExternalOAuthTokenError,
  ProviderWorkflowError,
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
      if (isNodeZendeskForbiddenError(err)) {
        throw new ExternalOAuthTokenError(err);
      } else if (isZendeskExpiredCursorError(err)) {
        throw new DustConnectorWorkflowError(
          "Cursor expired",
          "unhandled_internal_activity_error",
          err
        );
      } else if (isZendeskEpipeError(err)) {
        throw new ProviderWorkflowError(
          "zendesk",
          "EPIPE",
          "transient_upstream_activity_error",
          err
        );
      }

      throw err;
    }
  }
}
