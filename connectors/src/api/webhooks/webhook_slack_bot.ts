import tracer from "dd-trace";
import type { Request, Response } from "express";

import { botAnswerMessage } from "@connectors/connectors/slack/bot";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { Logger } from "@connectors/logger/logger";
import mainLogger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

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

type SlackWebhookReqBody = {
  type: string;
  challenge?: string;
  team_id: string;
};

type SlackWebhookEventReqBody = SlackWebhookReqBody & {
  event: SlackWebhookEvent;
};

type SlackWebhookResBody = WithConnectorsAPIErrorReponse<{
  challenge: string;
} | null>;

function isSlackWebhookEventReqBody(
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

async function handleChatBot(req: Request, res: Response, logger: Logger) {
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

const _webhookSlackBotAPIHandler = async (
  req: Request<
    Record<string, string>,
    SlackWebhookResBody,
    SlackWebhookReqBody
  >,
  res: Response<SlackWebhookResBody>
) => {
  if (req.body.type === "url_verification" && req.body.challenge) {
    return res.status(200).send({
      challenge: req.body.challenge,
    });
  }

  if (req.body.type === "event_callback") {
    if (!isSlackWebhookEventReqBody(req.body)) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Missing required fields in request body",
        },
        status_code: 400,
      });
    }
    const reqBody = req.body;
    const { team_id: teamId } = reqBody;
    if (!teamId) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Missing team_id in request body",
        },
        status_code: 400,
      });
    }

    const logger = mainLogger.child({
      connectorType: "slack",
      slackTeamId: teamId,
    });

    const slackConfigurations =
      await SlackConfigurationResource.listForTeamId(teamId);
    if (slackConfigurations.length === 0) {
      return apiError(req, res, {
        api_error: {
          type: "connector_configuration_not_found",
          message: `Slack configuration not found for teamId ${teamId}`,
        },
        status_code: 404,
      });
    }

    const { event } = reqBody;
    logger.info(
      {
        event: {
          type: event.type,
          channelType: event.channel_type,
          channelName: event.channel,
        },
      },
      "Processing webhook event"
    );

    try {
      switch (event.type) {
        case "app_mention": {
          const handleChatBotTraced = tracer.wrap(
            "slack.webhook.app_mention.handleChatBot",
            {
              type: "webhook",
              tags: {
                "slack.team_id": teamId,
              },
            },
            handleChatBot
          );
          await handleChatBotTraced(req, res, logger);
          break;
        }
      }
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        // Prevent 500 when we receive webhooks after a de-auth which can happen at times.
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "connector_oauth_error",
            message: e.message,
          },
        });
      }
      // Unexpected error
      throw e;
    }

    // returns 200 on all non supported messages types because slack will retry
    // indefinitely otherwise.
    return res.status(200).end();
  }
};

export const webhookSlackBotAPIHandler = withLogging(
  _webhookSlackBotAPIHandler
);
/**
 * Webhhok payload example. Can be handy for working on it.
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
