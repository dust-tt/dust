import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

function isConfluenceError(err: unknown): err is { statusCode: number } {
  return (
    err instanceof Error &&
    typeof (err as { statusCode?: unknown }).statusCode === "number" &&
    err.message.includes("Confluence")
  );
}

export class ConfluenceCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (isConfluenceError(err) && err.statusCode === 500) {
        throw {
          __is_dust_error: true,
          message: "Confluence Internal Error",
          type: "confluence_internal_error",
          error: err,
        };
      }
      throw err;
    }
  }
}
