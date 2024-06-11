import { ConfluenceClientError } from "@dust-tt/types";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ProviderWorkflowError } from "@connectors/lib/error";

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
      if (
        err instanceof ConfluenceClientError &&
        err.type === "http_response_error"
      ) {
        switch (err.status) {
          case 500:
            throw new ProviderWorkflowError(
              "500 - Internal Error",
              "confluence",
              err
            );

          case 502:
            throw new ProviderWorkflowError(
              "502 - Bad Gateway",
              "confluence",
              err
            );

          case 504:
            throw new ProviderWorkflowError(
              "504 - Gateway Time Out",
              "confluence",
              err
            );
        }
      }

      throw err;
    }
  }
}
