import {
  isSlackWebAPIPlatformError,
  isSlackWebAPIPlatformErrorBotNotFound,
} from "@connectors/connectors/slack/lib/errors";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import {
  getSlackBotInfo,
  makeSlackBotUserInfo,
} from "@connectors/connectors/slack/lib/slack_client";
import { getRepliesFromThread } from "@connectors/connectors/slack/lib/thread";
import logger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import { z } from "zod";

const SLACK_MESSAGE_GONE_ERRORS = ["thread_not_found", "message_not_found"];

const SlackBotMessageSchema = z.object({
  ts: z.string().optional(),
  username: z.string().nullish(),
  icons: z.object({ image_72: z.string().nullish() }).nullish(),
});

/**
 * @cc [owner:rfrenoy,label:product] bot-name-from-message-username
 * The returned bot MUST be named after the trimmed `username` of the message whose `ts` is
 * `messageTs`, read from the thread `threadTs` in `channelId` (`threadTs` equals `messageTs` for a
 * top-level message). That is where Slack Workflow Builder posts (`subtype: bot_message`) carry
 * their name when `bots.info` answers `bot_not_found`. Other messages of the thread MUST be
 * ignored. When that message is absent or has no `username`, the function MUST return `null`
 * rather than a bot with an empty name.
 */
export async function getSlackBotInfoFromMessage(
  connectorId: ModelId,
  slackClient: WebClient,
  {
    channelId,
    threadTs,
    messageTs,
  }: { channelId: string; threadTs: string; messageTs: string }
): Promise<SlackUserInfo | null> {
  let replies: MessageElement[];
  try {
    replies = await getRepliesFromThread({
      connectorId,
      slackClient,
      channelId,
      threadTs,
      useCase: "bot",
    });
  } catch (e) {
    if (
      isSlackWebAPIPlatformError(e) &&
      SLACK_MESSAGE_GONE_ERRORS.includes(e.data.error)
    ) {
      return null;
    }
    throw e;
  }

  const message = replies
    .flatMap((m) => {
      const parsed = SlackBotMessageSchema.safeParse(m);
      return parsed.success ? [parsed.data] : [];
    })
    .find((m) => m.ts === messageTs);
  const username = message?.username?.trim();
  if (!message || !username) {
    return null;
  }

  return makeSlackBotUserInfo({
    username,
    imageUrl: message.icons?.image_72 ?? null,
  });
}

/**
 * @cc [owner:rfrenoy,label:product] bot-identity-resolution-order
 * The bot posting a message MUST be identified from `bots.info` when Slack resolves `slackBotId` to
 * a named bot, otherwise from the trimmed `slackBotUsername` carried by the webhook event, otherwise
 * from the `username` of the message `messageTs` in thread `threadTs`. A `bots.info` failure other
 * than `bot_not_found` MUST propagate. When no source yields a name, the function MUST return
 * `null`.
 */
export async function resolveSlackBotInfo(
  connectorId: ModelId,
  slackClient: WebClient,
  {
    slackBotId,
    slackBotUsername,
    channelId,
    threadTs,
    messageTs,
  }: {
    slackBotId: string;
    slackBotUsername: string | undefined;
    channelId: string;
    threadTs: string;
    messageTs: string;
  }
): Promise<SlackUserInfo | null> {
  try {
    const botInfo = await getSlackBotInfo(connectorId, slackClient, slackBotId);
    if (botInfo) {
      return botInfo;
    }
  } catch (e) {
    if (!isSlackWebAPIPlatformErrorBotNotFound(e)) {
      if (isSlackWebAPIPlatformError(e)) {
        logger.error(
          { error: e, connectorId, slackBotId },
          "Failed to get slack bot info"
        );
      }
      throw e;
    }
  }

  const username = slackBotUsername?.trim();
  if (username) {
    return makeSlackBotUserInfo({ username, imageUrl: null });
  }

  return getSlackBotInfoFromMessage(connectorId, slackClient, {
    channelId,
    threadTs,
    messageTs,
  });
}
