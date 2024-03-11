import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { GaxiosError } from "googleapis-common";

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
      if (err instanceof GaxiosError && err.response?.status === 500) {
        throw {
          __is_dust_error: true,
          message: "Google Drive Internal Error",
          type: "google_drive_internal_error",
          error: err,
        };
      }
      if (err instanceof GaxiosError && err.response?.status === 429) {
        throw {
          __is_dust_error: true,
          message: "Google Drive Rate Limit Error",
          type: "google_drive_rate_limit_error",
          error: err,
        };
      }
      throw err;
    }
  }
}
