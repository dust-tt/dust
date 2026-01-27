import type { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ProviderRateLimitError } from "@connectors/lib/error";

// After this many attempts, start adding extra delay on top of the rate limit header.
const RATE_LIMIT_BACKOFF_ATTEMPT_THRESHOLD = 50;
// Extra delay added per attempt over the threshold (10 seconds).
const RATE_LIMIT_EXTRA_DELAY_PER_ATTEMPT_MS = 10_000;
// Maximum extra delay to add (5 minutes).
const RATE_LIMIT_MAX_EXTRA_DELAY_MS = 300_000;

export class SlackCastKnownErrorsInterceptor implements ActivityInboundCallsInterceptor {
  constructor(private readonly ctx: Context) {}

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      // Ensure rate limit errors with retryAfterMs are honored.
      if (err instanceof ProviderRateLimitError && err.retryAfter) {
        let delayMs = err.retryAfter;

        // Slack's rate limit header often returns a fixed 10s value which isn't
        // always sufficient. After many retries, add progressive backoff.
        const attempt = this.ctx.info.attempt;
        if (attempt > RATE_LIMIT_BACKOFF_ATTEMPT_THRESHOLD) {
          const extraDelayMs = Math.min(
            (attempt - RATE_LIMIT_BACKOFF_ATTEMPT_THRESHOLD) *
              RATE_LIMIT_EXTRA_DELAY_PER_ATTEMPT_MS,
            RATE_LIMIT_MAX_EXTRA_DELAY_MS
          );
          delayMs += extraDelayMs;
        }

        throw ApplicationFailure.create({
          message: `${err.message}. Retry after ${delayMs / 1000}s (attempt ${attempt})`,
          nextRetryDelay: delayMs,
          cause: err,
        });
      }

      throw err;
    }
  }
}
