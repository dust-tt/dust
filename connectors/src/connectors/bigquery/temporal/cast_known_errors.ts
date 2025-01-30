import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

interface BigQueryError extends Error {
  name: string;
  data: {
    nextAction: string;
  };
}

interface BigQueryExpiredPasswordError extends BigQueryError {
  name: "OperationFailedError";
  data: {
    nextAction: "PWD_CHANGE";
  };
}

interface BigQueryAccountLockedError extends BigQueryError {
  name: "OperationFailedError";
  data: {
    nextAction: "RETRY_LOGIN";
  };
}

interface BigQueryIncorrectCredentialsError extends BigQueryError {
  name: "OperationFailedError";
  data: {
    nextAction: "RETRY_LOGIN";
  };
}

function isBigQueryError(err: unknown): err is BigQueryError {
  return (
    err instanceof Error &&
    "name" in err &&
    "data" in err &&
    typeof err.data === "object" &&
    err.data !== null &&
    "nextAction" in err.data &&
    typeof err.data.nextAction === "string"
  );
}

function isBigQueryExpiredPasswordError(
  err: unknown
): err is BigQueryExpiredPasswordError {
  return isBigQueryError(err) && err.data.nextAction === "PWD_CHANGE";
}

function isBigQueryAccountLockedError(
  err: unknown
): err is BigQueryAccountLockedError {
  return (
    isBigQueryError(err) &&
    err.message.startsWith(
      "Your user account has been temporarily locked due to too many failed attempts"
    )
  );
}

function isBigQueryIncorrectCredentialsError(
  err: unknown
): err is BigQueryIncorrectCredentialsError {
  return (
    isBigQueryError(err) &&
    err.message.startsWith("Incorrect username or password was specified")
  );
}
export class BigQueryCastKnownErrorsInterceptor
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
        isBigQueryExpiredPasswordError(err) ||
        // technically, the one below could be transient;
        // we add it here to make the user aware that getting locked out of his account blocks the connection
        isBigQueryAccountLockedError(err) ||
        isBigQueryIncorrectCredentialsError(err)
      ) {
        throw new ExternalOAuthTokenError(err);
      }
      throw err;
    }
  }
}
