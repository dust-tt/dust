import type { TurnContext } from "botbuilder";

import { sendActivity } from "@connectors/api/webhooks/teams/bot_messaging_utils";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftBotConfigurationResource } from "@connectors/resources/microsoft_resource";

export async function getConnector(context: TurnContext) {
  // Extract tenant ID from Teams context
  let tenantId: string | undefined;

  // Teams provides tenant ID in multiple possible locations
  if (context.activity.channelData?.tenant?.id) {
    tenantId = context.activity.channelData.tenant.id;
  } else if (context.activity.conversation?.tenantId) {
    tenantId = context.activity.conversation.tenantId;
  } else if (context.activity.channelData?.tenantId) {
    tenantId = context.activity.channelData.tenantId;
  }

  if (!tenantId) {
    logger.error("No tenant ID found in Teams context");
    await sendActivity(context, {
      type: "message",
      text: "❌ Unable to identify tenant for this Teams message",
    });
    return;
  }

  logger.info({ tenantId }, "Found tenant ID in Teams context");

  // Find the bot configuration for this tenant
  const botConfig =
    await MicrosoftBotConfigurationResource.fetchByTenantId(tenantId);

  if (!botConfig || !botConfig.botEnabled) {
    logger.error(
      { tenantId },
      "No Microsoft Bot configuration found for tenant"
    );
    await sendActivity(context, {
      type: "message",
      text: "❌ Microsoft Teams Integration is not enabled for your Organization.",
    });
    return;
  }

  // Get the corresponding connector
  const connector = await ConnectorResource.fetchById(botConfig.connectorId);

  if (!connector) {
    logger.error(
      {
        connectorId: botConfig.connectorId,
        tenantId,
      },
      "Connector not found for bot configuration"
    );
    await sendActivity(context, {
      type: "message",
      text: "❌ Microsoft Teams Integration is not enabled for your Organization.",
    });
    return;
  }

  logger.info(
    {
      connectorId: connector.id,
      tenantId,
      workspaceId: connector.workspaceId,
    },
    "Found matching Microsoft Bot connector"
  );

  return connector;
}
