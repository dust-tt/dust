import { makeScript } from "scripts/helpers";

import { getConnectorManager } from "@connectors/connectors";
import { uninstallSlack } from "@connectors/connectors/slack";
import { slackConfig } from "@connectors/connectors/slack/lib/config";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { concurrentExecutor } from "@connectors/types";

async function markConnectorAsErrorAndUninstall({
  connectorId,
  execute,
  logger,
}: {
  connectorId: ModelId;
  execute: boolean;
  logger: Logger;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.info({ connectorId }, "Connector not found");
    return;
  }

  if (connector.type !== "slack") {
    logger.info({ connectorId }, "Connector is not a Slack connector");
    return;
  }

  const connectorManager = await getConnectorManager({
    connectorId,
    connectorProvider: connector.type,
  });

  if (execute) {
    // Stop the workflows.
    await connectorManager.pauseAndStop({
      reason: "Stopped to uninstall Slack app (script)",
    });

    // Mark the connector as error so it's not picked up by monitors.
    await connector.markAsError("third_party_internal_error");

    // Finally, uninstall the Slack app.
    await uninstallSlack(
      connector.connectionId,
      slackConfig.getRequiredSlackClientId(),
      slackConfig.getRequiredSlackClientSecret()
    );
  }

  logger.info(
    { connectorId },
    "Connector marked as error and Slack app uninstalled"
  );
}

makeScript(
  {
    connectorIds: {
      type: "array",
      required: true,
    },
  },
  async ({ connectorIds, execute }, logger) => {
    const connectorIdsInt = connectorIds.map((id) => parseInt(id, 10));

    await concurrentExecutor(
      connectorIdsInt,
      (cId) =>
        markConnectorAsErrorAndUninstall({ connectorId: cId, execute, logger }),
      {
        concurrency: 10,
      }
    );
  }
);
