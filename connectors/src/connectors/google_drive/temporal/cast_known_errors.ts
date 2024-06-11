import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { GaxiosError } from "googleapis-common";

import { ProviderWorkflowError } from "@connectors/lib/error";

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
      if (err instanceof GaxiosError) {
        switch (err.response?.status) {
          case 429:
            throw new ProviderWorkflowError(
              "Google Drive Rate Limit Error",
              "google_drive",
              err
            );

          case 500:
            throw new ProviderWorkflowError(
              "Google Drive Internal Error",
              "google_drive",
              err
            );
        }
      }

      throw err;
    }
  }
}
