import type { Request, Response } from "express";

import {
  handleChatBotWithTrace,
  isSlackWebhookEventReqBody,
  SlackWebhookReqBody,
  SlackWebhookResBody,
} from "@connectors/api/webhooks/webhook_slack_shared";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import mainLogger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";

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
      connectorType: "slackbot",
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
          await handleChatBotWithTrace({
            "slack.team_id": teamId,
          })(req, res, logger);
          break;
        }
        default: {
          logger.info(
            {
              event: {
                type: event.type,
                channelType: event.channel_type,
                channelName: event.channel,
              },
            },
            "Webhook event type not supported"
          );
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
