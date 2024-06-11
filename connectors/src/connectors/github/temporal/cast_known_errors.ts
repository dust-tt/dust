import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
import { RequestError } from "octokit";

import { ProviderWorkflowError } from "@connectors/lib/error";

export class GithubCastKnownErrorsInterceptor
  implements ActivityInboundCallsInterceptor
{
  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    try {
      return await next(input);
    } catch (err: unknown) {
      if (err instanceof RequestError) {
        if (err.status === 403 && err.name === "HttpError") {
          throw new ProviderWorkflowError(
            "github",
            "403 - Rate Limit Error",
            "rate_limit_error",
            err
          );
        }
      }

      throw err;
    }
  }
}
