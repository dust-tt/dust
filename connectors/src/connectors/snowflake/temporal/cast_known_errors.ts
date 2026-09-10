import {
  ExternalOAuthTokenError,
  ThirdPartyConfigurationError,
} from "@connectors/lib/error";
import { normalizeError } from "@dust-tt/client";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

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

function isSnowflakeRoleNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "OperationFailedError" &&
    "code" in err &&
    (typeof err.code === "string" || typeof err.code === "number") &&
    ["390189", "390186"].includes(`${err.code}`)
  );
}

function isSnowflakeSuspendedError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "OperationFailedError" &&
    "message" in err &&
    typeof err.message === "string" &&
    err.message.includes("suspended")
  );
}

function isSnowflakeUserAccessDisabledError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "OperationFailedError" &&
    "message" in err &&
    typeof err.message === "string" &&
    err.message.includes("User access disabled")
  );
}

function isSnowflakeInsufficientPrivilegesError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "OperationFailedError" &&
    "message" in err &&
    typeof err.message === "string" &&
    err.message.includes("SQL access control error")
  );
}

function isSnowflakeInvalidJwtError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "OperationFailedError" &&
    "message" in err &&
    typeof err.message === "string" &&
    err.message.includes("JWT token is invalid")
  );
}

function isSnowflakeListingTrialExpiredError(err: unknown): err is Error {
  return (
    err instanceof Error &&
    "code" in err &&
    typeof err.code === "string" &&
    err.code === "090693"
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
        isSnowflakeRoleNotFoundError(err) ||
        isSnowflakeSuspendedError(err) ||
        isSnowflakeUserAccessDisabledError(err) ||
        isSnowflakeInsufficientPrivilegesError(err) ||
        isSnowflakeInvalidJwtError(err)
      ) {
        throw new ExternalOAuthTokenError(normalizeError(err));
      }
      if (isSnowflakeListingTrialExpiredError(err)) {
        throw new ThirdPartyConfigurationError(err);
      }
      throw err;
    }
  }
}
