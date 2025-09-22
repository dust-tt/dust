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
      const isExpiredCursorError =
        err instanceof GongAPIError &&
        err.status === 400 &&
        Array.isArray(err.errors) &&
        err.errors.some((e) => e.toLowerCase().includes("cursor has expired"));

      if (isExpiredCursorError) {
        // Classify for monitoring parity with other connectors (e.g., Zendesk)
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
