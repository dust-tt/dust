import { ProviderRateLimitError } from "@connectors/lib/error";
import { ApplicationFailure } from "@temporalio/common";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

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
        if (err.retryAfterMs) {
          throw ApplicationFailure.create({
            message: `${err.message}. Retry after ${err.retryAfterMs / 1000}s`,
            nextRetryDelay: err.retryAfterMs,
            cause: err,
          });
        }
      }

      throw err;
    }
  }
}
