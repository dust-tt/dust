import type { WebClient } from "@slack/web-api";
import type { Request, Response } from "express";
import type { Logger } from "pino";

import { makeMarkdownBlock } from "@connectors/connectors/slack/chat/blocks";
import { getBotUserIdMemoized } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { removeNulls } from "@connectors/types/shared/utils/general";

async function sendSlackMessage(
  slackClient: WebClient,
  {
    channel,
    threadTs,
    message,
  }: {
    channel: string;
    threadTs: string;
    message: string;
  },
  logger: Logger
) {
  try {
    await slackClient.chat.postMessage({
      channel,
      blocks: makeMarkdownBlock(message),
      thread_ts: threadTs,
    });
  } catch (error) {
    logger.error({ error }, "Error sending Slack message");
  }
}

const REQUIRE_SLACK_BOT_INSTALLATION_MESSAGE =
  "Hi there! This version of Dust is deprecated. You can ask a Slack admin to install the new version of Dust on your Slack workspace!";

async function makeSlackDeprecatedBotErrorMessage(
  slackBotConnector: ConnectorResource
) {
  const slackClient = await getSlackClient(slackBotConnector.id);

  const slackBotUserId = await getBotUserIdMemoized(
    slackClient,
    slackBotConnector.id
  );

  return `Oops! That's the deprecated version of Dust. Mention <@${slackBotUserId}> instead!`;
}

export async function handleDeprecatedChatBot(
  req: Request,
  res: Response,
  logger: Logger
) {
  const { event, team_id: slackTeamId } = req.body;
  const { channel: slackChannel, ts: slackMessageTs } = event;

  const localLogger = logger.child({
    action: "handleDeprecatedChatBot",
    slackChannel,
    slackMessageTs,
    slackTeamId,
  });

  const slackConfigurations =
    await SlackConfigurationResource.listForTeamId(slackTeamId);
  // If there are no slack configurations, return 200.
  if (slackConfigurations.length === 0) {
    localLogger.info("No deprecated Slack configurations found.", slackTeamId);

    return res.status(200).send();
  }

  const connectors = removeNulls(
    await Promise.all(
      slackConfigurations.map((config) =>
        ConnectorResource.fetchById(config.connectorId)
      )
    )
  );

  const deprecatedSlackConnector = connectors.find((c) => c.type === "slack");
  const deprecatedSlackConfiguration = slackConfigurations.find(
    (c) => c.connectorId === deprecatedSlackConnector?.id
  );
  const slackBotConnector = connectors.find((c) => c.type === "slack_bot");
  const slackBotConfiguration = slackConfigurations.find(
    (c) => c.connectorId === slackBotConnector?.id
  );

  // We need to answer 200 quickly to Slack, otherwise they will retry the HTTP request.
  res.status(200).send();

  if (!deprecatedSlackConnector) {
    localLogger.info("No deprecated Slack connector found.");
    return;
  }

  const deprecatedSlackClient = await getSlackClient(
    deprecatedSlackConnector?.id
  );

  // Case 1: Slack bot connector is not installed.
  if (!slackBotConnector) {
    localLogger.info("Slack bot connector is not installed.");
    return sendSlackMessage(
      deprecatedSlackClient,
      {
        channel: slackChannel,
        threadTs: slackMessageTs,
        message: REQUIRE_SLACK_BOT_INSTALLATION_MESSAGE,
      },
      localLogger
    );
  }

  const isDeprecatedBotEnabled = deprecatedSlackConfiguration?.botEnabled;
  const isSlackBotEnabled = slackBotConfiguration?.botEnabled;

  // Case 2: Both Slack connectors are installed but deprecated bot is still enabled.
  if (slackBotConnector && isDeprecatedBotEnabled && !isSlackBotEnabled) {
    localLogger.info("Deprecated bot is enabled but Slack bot is not.");

    return sendSlackMessage(
      deprecatedSlackClient,
      {
        channel: slackChannel,
        threadTs: slackMessageTs,
        message: REQUIRE_SLACK_BOT_INSTALLATION_MESSAGE,
      },
      localLogger
    );
  }

  // Case 3: New bot is enabled but they are using the deprecated bot mention.
  if (slackBotConnector && isSlackBotEnabled) {
    localLogger.info(
      "New bot is enabled but they are using the deprecated bot mention."
    );

    const message = await makeSlackDeprecatedBotErrorMessage(slackBotConnector);

    return sendSlackMessage(
      deprecatedSlackClient,
      {
        channel: slackChannel,
        threadTs: slackMessageTs,
        message,
      },
      localLogger
    );
  }
}
