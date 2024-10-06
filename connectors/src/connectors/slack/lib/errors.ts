import type {
  ChatPostMessageResponse,
  WebAPIPlatformError,
} from "@slack/web-api";
import { ErrorCode } from "@slack/web-api";
import type { Attributes } from "sequelize";

import type { SlackChatBotMessage } from "@connectors/lib/models/slack";

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
