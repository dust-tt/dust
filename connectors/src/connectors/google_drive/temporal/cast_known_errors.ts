import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

export class GoogleDriveCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      const maybeGoogleInternalError = err as {
        code: number;
        type: string;
        config: {
          url: string;
        };
      };

      if (
        maybeGoogleInternalError.code === 500 &&
        maybeGoogleInternalError.config.url.startsWith(
          "https://www.googleapis.com/"
        ) &&
        maybeGoogleInternalError.type === "GaxiosError"
      ) {
        throw {
          __is_dust_error: true,
          message: "Google Drive Internal Error",
          type: "google_drive_internal_error",
        };
      }

      throw err;
    }
  }
}
