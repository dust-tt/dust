import tracer from "dd-trace";
import type { Request, Response } from "express";

import { botAnswerMessage } from "@connectors/connectors/slack/bot";
import { getBotUserIdMemoized } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import type { Logger } from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

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
  channel_type?: "channel" | "im" | "mpim";
  text: string; // content of the message
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
    const botUserId = await getBotUserIdMemoized(slackClient, connector.id);

    return message.includes(`<@${botUserId}>`);
  } catch (error) {
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

  const slackMessage = event.text;
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
