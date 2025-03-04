import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

export class GongCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    // Will add custom error handling as we discover them
    return next(input);
  }
}
