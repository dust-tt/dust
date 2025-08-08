import type {
  ChatPostMessageResponse,
  CodedError,
  WebAPIHTTPError,
  WebAPIPlatformError,
  WebAPIRateLimitedError,
} from "@slack/web-api";
import { ErrorCode } from "@slack/web-api";
import type { Attributes } from "sequelize";

import type { SlackChatBotMessage } from "@connectors/lib/models/slack";

function isCodedError(error: unknown): error is CodedError {
  return error != null && typeof error === "object" && "code" in error;
}

export class SlackExternalUserError extends Error {}

export class SlackMessageError extends Error {
  constructor(
    message: string,
    public slackChatBotMessage: Attributes<SlackChatBotMessage>,
    public mainMessage: ChatPostMessageResponse
  ) {
    super(message);
  }
}

export function isSlackWebAPIPlatformError(
  err: unknown
): err is WebAPIPlatformError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === ErrorCode.PlatformError
  );
}

export function isSlackWebAPIPlatformErrorBotNotFound(
  err: unknown
): err is WebAPIPlatformError {
  return isSlackWebAPIPlatformError(err) && err.data.error === "bot_not_found";
}

// Type guards for Slack errors
// See https://github.com/slackapi/node-slack-sdk/blob/main/packages/web-api/src/errors.ts.
export function isWebAPIRateLimitedError(
  error: unknown
): error is WebAPIRateLimitedError {
  return (
    isCodedError(error) &&
    error.code === ErrorCode.RateLimitedError &&
    "retryAfter" in error &&
    typeof error.retryAfter === "number"
  );
}

export function isWebAPIHTTPError(error: unknown): error is WebAPIHTTPError {
  return (
    isCodedError(error) &&
    error.code === ErrorCode.HTTPError &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

export function isWebAPIPlatformError(
  error: unknown
): error is WebAPIPlatformError {
  return (
    isCodedError(error) &&
    error.code === ErrorCode.PlatformError &&
    "data" in error &&
    error.data != null &&
    typeof error.data === "object" &&
    "error" in error.data &&
    typeof error.data.error === "string"
  );
}
