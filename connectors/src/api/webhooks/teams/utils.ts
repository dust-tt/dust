import type { TurnContext } from "botbuilder";

import { createErrorAdaptiveCard } from "@connectors/connectors/teams/adaptive_cards";
import { sendActivity } from "@connectors/connectors/teams/bot_messaging_utils";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

export async function getConnector(context: TurnContext) {
  // Find the connector for this Teams conversation
  // For now, use the first Microsoft connector - in production you'd want to identify the specific one
  const connectors = await ConnectorResource.listByType("microsoft", {});

  if (connectors.length === 0) {
    logger.error("No Microsoft connector found for Teams message");
    await sendActivity(
      context,
      createErrorAdaptiveCard({
        error: "No Microsoft connector configured",
        workspaceId: "unknown",
      })
    );
    return;
  }

  const connector = connectors[0];

  return connector;
}
