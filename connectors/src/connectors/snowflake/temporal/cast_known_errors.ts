import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

import { ExternalOAuthTokenError } from "@connectors/lib/error";

interface SnowflakeError extends Error {
  name: string;
  data: {
    nextAction: string;
  };
}

interface SnowflakeExpiredPasswordError extends SnowflakeError {
  name: "OperationFailedError";
  data: {
    nextAction: "PWD_CHANGE";
  };
}

interface SnowflakeAccountLockedError extends SnowflakeError {
  name: "OperationFailedError";
  data: {
    nextAction: "RETRY_LOGIN";
  };
}

interface SnowflakeIncorrectCredentialsError extends SnowflakeError {
  name: "OperationFailedError";
  data: {
    nextAction: "RETRY_LOGIN";
  };
}

function isSnowflakeError(err: unknown): err is SnowflakeError {
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

function isSnowflakeExpiredPasswordError(
  err: unknown
): err is SnowflakeExpiredPasswordError {
  return isSnowflakeError(err) && err.data.nextAction === "PWD_CHANGE";
}

function isSnowflakeAccountLockedError(
  err: unknown
): err is SnowflakeAccountLockedError {
  return (
    isSnowflakeError(err) &&
    err.message.startsWith(
      "Your user account has been temporarily locked due to too many failed attempts"
    )
  );
}

function isSnowflakeIncorrectCredentialsError(
  err: unknown
): err is SnowflakeIncorrectCredentialsError {
  return (
    isSnowflakeError(err) &&
    err.message.startsWith("Incorrect username or password was specified")
  );
}

interface SnowflakeRoleNotFoundError extends Error {
  name: "OperationFailedError";
  data: {
    errorCode: "390189";
    nextAction: "RETRY_LOGIN";
  };
}

function isSnowflakeRoleNotFoundError(
  err: unknown
): err is SnowflakeRoleNotFoundError {
  const maybeRoleError = err as {
    name: "OperationFailedError";
    code: "390189";
  };
  return (
    "name" in maybeRoleError &&
    maybeRoleError.name === "OperationFailedError" &&
    "code" in maybeRoleError &&
    `${maybeRoleError.code}` === "390189"
  );
}

export class SnowflakeCastKnownErrorsInterceptor
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
        isSnowflakeExpiredPasswordError(err) ||
        // technically, the one below could be transient;
        // we add it here to make the user aware that getting locked out of his account blocks the connection
        isSnowflakeAccountLockedError(err) ||
        isSnowflakeIncorrectCredentialsError(err) ||
        isSnowflakeRoleNotFoundError(err)
      ) {
        throw new ExternalOAuthTokenError(err);
      }
      throw err;
    }
  }
}
