import type { Request, Response } from "express";

import type {
  SlackWebhookEvent,
  SlackWebhookReqBody,
  SlackWebhookResBody,
} from "@connectors/api/webhooks/slack/utils";
import { isSlackWebhookEventReqBody } from "@connectors/api/webhooks/slack/utils";
import { botAnswerMessageWithAgent } from "@connectors/connectors/slack/bot";
import {
  getSlackAccessToken,
  getSlackClient,
} from "@connectors/connectors/slack/lib/slack_client";
import type { Logger } from "@connectors/logger/logger";
import mainLogger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { ConnectorResource as ConnectorRes } from "@connectors/resources/connector_resource";
import { SlackLabsConfigurationResource } from "@connectors/resources/slack_labs_configuration_resource";

const _webhookSlackLabsBotAPIHandler = async (
  req: Request<
    Record<string, string>,
    SlackWebhookResBody,
    SlackWebhookReqBody
  >,
  res: Response<SlackWebhookResBody>
) => {
  if (req.body.type === "url_verification" && req.body.challenge) {
    return res.status(200).send({ challenge: req.body.challenge });
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
      connectorType: "labs_slack_bot",
      slackTeamId: teamId,
    });

    const { event } = reqBody;
    logger.info(
      {
        event: {
          type: event.type,
          channelType: event.channel_type,
          channelName: event.channel,
        },
      },
      "Processing Labs webhook event"
    );

    // Only handle message events in channels
    if (event.type !== "message" || event.channel_type !== "channel") {
      return res.status(200).send();
    }

    // Ignore thread replies, message edits, deletions, and bot messages
    if (
      event.subtype === "message_changed" ||
      event.subtype === "message_deleted" ||
      event.thread_ts ||
      event.bot_id ||
      !event.user
    ) {
      return res.status(200).send();
    }

    // Get channel configuration using proper resource methods
    if (!event.channel) {
      logger.info({ teamId }, "No channel ID in event");
      return res.status(200).send();
    }

    const slackLabsConfig =
      await SlackLabsConfigurationResource.fetchByTeamIdAndChannel(
        teamId,
        event.channel
      );

    if (!slackLabsConfig) {
      logger.info(
        { teamId, channel: event.channel },
        "No Labs configuration found for team and channel"
      );
      return res.status(200).send();
    }

    const labsConnector = await ConnectorRes.fetchById(
      slackLabsConfig.connectorId
    );
    if (!labsConnector) {
      logger.error(
        { connectorId: slackLabsConfig.connectorId },
        "Labs connector not found"
      );
      return res.status(200).send();
    }

    const { agentConfigurationId } = slackLabsConfig;

    res.status(200).send();

    // Process the message asynchronously to prevent webhook timeouts and retries
    processLabsSlackMessage(
      logger,
      labsConnector,
      { agentConfigurationId },
      event
    ).catch((error) => {
      logger.error({ error, teamId }, "Failed to process Labs message");
    });

    return;
  }

  return res.status(200).send();
};

async function processLabsSlackMessage(
  logger: Logger,
  connector: ConnectorResource,
  channelConfig: { agentConfigurationId: string },
  event: SlackWebhookEvent
) {
  if (!event.user || !event.channel || !event.ts) {
    logger.error("Slack event missing required properties");
    return;
 }

  try {
    const slackLabsConfig =
      await SlackLabsConfigurationResource.fetchByConnectorId(connector.id);
    if (!slackLabsConfig) {
      logger.error(
        { connectorId: connector.id },
        "SlackLabs configuration not found"
      );
      return;
    }
    const slackTeamId = slackLabsConfig.slackTeamId;

    // Use -specific bot logic with structured output enabled
    const botRes = await botAnswerMessageWithAgent(
      event.text || "",
      {
        slackTeamId,
        slackChannel: event.channel,
        slackUserId: event.user,
        slackMessageTs: event.ts,
        slackThreadTs: event.thread_ts || event.ts,
      },
      channelConfig.agentConfigurationId,
      {
        enableStructuredOutput: true,
        enableMessageSplitting: true,
      }
    );

    if (botRes.isErr()) {
      logger.error(
        { error: botRes.error, slackUserId: event.user },
        "Failed to process Labs message with bot"
      );
    }
  } catch (error) {
    logger.error(
      {
        error,
        channel: event.channel,
      },
      "Failed to process Labs Slack message"
    );

    // Try to post error message
    try {
      const slackAccessToken = await getSlackAccessToken(
        connector.connectionId
      );
      const slackClient = await getSlackClient(slackAccessToken);
      await slackClient.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: "An error occurred while processing your message. Our team has been notified.",
      });
    } catch (postError) {
      logger.error({ postError }, "Failed to post error message");
    }
  }
}

export const webhookSlackLabsBotAPIHandler = withLogging(
  _webhookSlackLabsBotAPIHandler
);
