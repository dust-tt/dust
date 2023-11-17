import { RequestError } from "@octokit/types";
import {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";
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
      const maybeGhError = err as RequestError;

      if (maybeGhError.status === 403 && maybeGhError.name === "HttpError") {
        throw {
          __is_dust_error: true,
          message: "Github rate limited",
          type: "github_rate_limited",
        };
      }
    }
  }
}
