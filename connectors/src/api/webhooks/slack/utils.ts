import { botAnswerMessage } from "@connectors/connectors/slack/bot";
import { getBotUserIdResponse } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { formatSlackMessageUnfurlAttachments } from "@connectors/connectors/slack/lib/message_attachments";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { throttleWithRedis } from "@connectors/lib/throttle";
import type { Logger } from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import { removeNulls } from "@connectors/types/shared/utils/general";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import tracer from "dd-trace";
import type { Request, Response } from "express";

const SLACK_CHATBOT_RATE_LIMIT_MAX_PER_ACTOR = 10;
const SLACK_CHATBOT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/**
 * Webhook payload example. Can be handy for working on it.
 * This is what Slack sends us when a new message is posted in a channel.
 *
 * {
  token: '6OiSmwn7QoyS8A3yL6tddCHd',
  team_id: 'T050RH73H9P',
  context_team_id: 'T050RH73H9P',
  context_enterprise_id: null,
  api_app_id: 'A04T6G3E9FY',
  event: {
    client_msg_id: 'af462834-af02-4f6b-82cf-a1f20150cdab',
    type: 'message',
    text: 'waiting for webhook….',
    user: 'U0506AXSHN2',
    ts: '1682680228.216339',
    blocks: [ [Object] ],
    team: 'T050RH73H9P',
    channel: 'C050DRFBYGK',
    event_ts: '1682680228.216339',
    channel_type: 'channel'
  },
  type: 'event_callback',
  event_id: 'Ev055EA9CB6X',
  event_time: 1682680228,
  authorizations: [
    {
      enterprise_id: null,
      team_id: 'T050RH73H9P',
      user_id: 'U04VCU7TB9V',
      is_bot: true,
      is_enterprise_install: false
    }
  ],
  is_ext_shared_channel: false,
  event_context: '4-eyJldCI6Im1lc3NhZ2UiLCJ0aWQiOiJUMDUwUkg3M0g5UCIsImFpZCI6IkEwNFQ2RzNFOUZZIiwiY2lkIjoiQzA1MERSRkJZR0sifQ'
}
 */

type SlackWebhookEventSubtype =
  | "message_changed"
  | "message_deleted"
  | "channel_name";

export interface SlackWebhookEvent<T = string> {
  bot_id?: string;
  channel?: T;
  subtype?: SlackWebhookEventSubtype;
  hidden?: boolean; // added for message_deleted
  deleted_ts?: string; // added for message_deleted - timestamp of deleted message
  user?: string;
  ts?: string; // slack message id
  thread_ts?: string; // slack thread id
  type?: string; // event type (eg: message)
  channel_type?: "channel" | "group" | "im" | "mpim";
  text: string; // content of the message
  attachments?: MessageElement["attachments"];
  old_name?: string; // when renaming channel: old channel name
  name?: string; // when renaming channel: new channel name
  message?: {
    bot_id?: string;
  };
}

export type SlackWebhookReqBody = {
  type: string;
  challenge?: string;
  team_id: string;
};

export type SlackWebhookEventReqBody = SlackWebhookReqBody & {
  event: SlackWebhookEvent;
};

export type SlackWebhookResBody = WithConnectorsAPIErrorReponse<{
  challenge: string;
} | null>;

export function isSlackWebhookEventReqBody(
  body: SlackWebhookReqBody
): body is SlackWebhookEventReqBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "event" in body &&
    "type" in body &&
    "team_id" in body
  );
}

export const withTrace =
  <T = typeof handleChatBot>(tags: tracer.SpanOptions["tags"]) =>
  (fn: T) =>
    tracer.wrap(
      "slack.webhook.app_mention.handleChatBot",
      {
        type: "webhook",
        tags,
      },
      fn
    );

export async function isAppMentionMessage(
  message: string,
  teamId: string
): Promise<boolean> {
  try {
    const slackConfig =
      await SlackConfigurationResource.fetchByActiveBot(teamId);
    if (!slackConfig) {
      return false;
    }

    const connector = await ConnectorResource.fetchById(
      slackConfig.connectorId
    );
    if (!connector) {
      return false;
    }

    const slackClient = await getSlackClient(connector.id);
    const botUserIdRes = await getBotUserIdResponse(slackClient, connector.id);

    if (botUserIdRes.isErr()) {
      return false;
    }

    return message.includes(`<@${botUserIdRes.value}>`);
  } catch (_error) {
    // If we can't determine, default to false
    return false;
  }
}

export async function handleChatBot(
  req: Request,
  res: Response,
  logger: Logger
) {
  const { event } = req.body;

  const forwardedMessagesText = formatSlackMessageUnfurlAttachments(
    event.attachments
  );
  const slackMessage = removeNulls([
    event.text || null,
    forwardedMessagesText || null,
  ]).join("\n");
  const slackTeamId = req.body.team_id;
  const slackChannel = event.channel;
  const slackUserId = event.user;
  const slackBotId = event.bot_id || null;
  const slackMessageTs = event.ts;
  const slackThreadTs = event.thread_ts || null;

  logger.info(
    {
      event: {
        channel: slackChannel,
        teamId: slackTeamId,
        userId: slackUserId,
      },
    },
    "Processing app mention"
  );

  if (
    !slackMessage ||
    !slackTeamId ||
    !slackChannel ||
    !slackMessageTs ||
    (!slackBotId && !slackUserId)
  ) {
    logger.error(
      {
        slackMessage,
        slackTeamId,
        slackChannel,
        slackUserId,
        slackBotId,
        slackMessageTs,
      },
      "Missing required fields in request body"
    );
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required fields in request body",
      },
      status_code: 400,
    });
  }

  // We need to answer 200 quickly to Slack, otherwise they will retry the HTTP request.
  res.status(200).send();

  const actorId = slackUserId || slackBotId;
  if (!actorId) {
    throw new Error("Failed to get Slack actor id.");
  }

  const shouldProcessMessage = await throttleWithRedis(
    {
      limit: SLACK_CHATBOT_RATE_LIMIT_MAX_PER_ACTOR,
      windowInMs: SLACK_CHATBOT_RATE_LIMIT_WINDOW_MS,
    },
    `slack-chatbot:${slackTeamId}:${actorId}`,
    { canBeIgnored: true },
    async () => true,
    {
      source: "slack-chatbot-webhook",
      slackTeamId,
      slackChannel,
      actorId,
    }
  );
  if (!shouldProcessMessage) {
    logger.warn(
      {
        slackTeamId,
        slackChannel,
        slackUserId,
        slackBotId,
        slackMessageTs,
        slackThreadTs,
        rateLimitMaxPerActor: SLACK_CHATBOT_RATE_LIMIT_MAX_PER_ACTOR,
        rateLimitWindowMs: SLACK_CHATBOT_RATE_LIMIT_WINDOW_MS,
      },
      "Rate limited Slack Chat Bot message"
    );
    return;
  }

  const params = {
    slackTeamId,
    slackChannel,
    slackUserId,
    slackBotId,
    slackMessageTs,
    slackThreadTs,
  };
  const botRes = await botAnswerMessage(slackMessage, params);
  if (botRes.isErr()) {
    logger.error(
      {
        error: botRes.error,
        ...params,
      },
      "Failed to answer to Slack message"
    );
  }
}
