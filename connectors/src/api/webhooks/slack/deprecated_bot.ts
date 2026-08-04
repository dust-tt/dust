import { makeMarkdownBlock } from "@connectors/connectors/slack/chat/blocks";
import { getBotUserIdResponse } from "@connectors/connectors/slack/lib/bot_user_helpers";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { removeNulls } from "@connectors/types/shared/utils/general";
import type { WebClient } from "@slack/web-api";
import type { Logger } from "pino";

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

  const slackBotUserIdRes = await getBotUserIdResponse(
    slackClient,
    slackBotConnector.id
  );
  if (slackBotUserIdRes.isErr()) {
    throw slackBotUserIdRes.error;
  }

  return `Oops! That's the deprecated version of Dust. Mention <@${slackBotUserIdRes.value}> instead!`;
}

export async function handleDeprecatedChatBot({
  logger,
  slackChannel,
  slackMessageTs,
  slackTeamId,
}: {
  logger: Logger;
  slackChannel: string;
  slackMessageTs: string;
  slackTeamId: string;
}) {
  const localLogger = logger.child({
    action: "handleDeprecatedChatBot",
    slackChannel,
    slackMessageTs,
    slackTeamId,
  });

  const slackConfigurations = await SlackConfigurationResource.listForTeamId(
    slackTeamId,
    "slack"
  );
  if (slackConfigurations.length === 0) {
    localLogger.info("No deprecated Slack configurations found.", slackTeamId);

    return;
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

  if (!deprecatedSlackConnector) {
    localLogger.info("No deprecated Slack connector found.");
    return;
  }
  if (deprecatedSlackConnector.isPaused()) {
    localLogger.info(
      { connectorId: deprecatedSlackConnector.id },
      "Deprecated Slack connector is paused."
    );
    return;
  }

  const deprecatedSlackClient = await getSlackClient(
    deprecatedSlackConnector.id
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
