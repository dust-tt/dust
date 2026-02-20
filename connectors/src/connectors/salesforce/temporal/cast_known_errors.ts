import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

export class SalesforceCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    // Will add custom error handling as we discover them
    return next(input);
  }
}
