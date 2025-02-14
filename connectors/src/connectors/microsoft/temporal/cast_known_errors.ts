import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

// The SDK does not expose an error class that is rich enough for our use.
// We'll use this function as a temporary solution for identifying an identified type of error.
export function isMicrosoftSignInError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    err.message.startsWith(
      "Error retrieving access token from microsoft: code=provider_access_token_refresh_error"
    ) &&
    err.message.includes("invalid_grant") &&
    err.message.includes("AADSTS50173")
  );
}

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
      // See https://learn.microsoft.com/en-us/answers/questions/1339560/sign-in-error-code-50173
      // TODO(2025-02-12): add an error type for Microsoft client errors and catch them at strategic locations (e.g. API call to instantiate a client)
      if (isMicrosoftSignInError(err)) {
        throw new ExternalOAuthTokenError(err);
      }
      throw err;
    }
  }
}
