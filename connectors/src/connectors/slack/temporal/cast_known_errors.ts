import { ApplicationFailure } from "@temporalio/common";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ProviderRateLimitError } from "@connectors/lib/error";

export class SlackCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      // Ensure rate limit errors with retryAfterMs are honored.
      if (err instanceof ProviderRateLimitError) {
        if (err.retryAfter) {
          throw ApplicationFailure.create({
            message: `${err.message}. Retry after ${err.retryAfter / 1000}s`,
            nextRetryDelay: err.retryAfter,
            cause: err,
          });
        }
      }

      throw err;
    }
  }
}
