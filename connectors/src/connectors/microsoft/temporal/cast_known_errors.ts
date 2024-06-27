import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

export class MicrosoftCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      // no error to intercept and cast as of yet
      // but it will come very soon (below is to pleas the linter)
      if (err instanceof Error) {
        throw err;
      }
      throw err;
    }
  }
}
