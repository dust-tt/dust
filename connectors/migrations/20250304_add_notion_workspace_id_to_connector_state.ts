import type { Logger } from "pino";
import { makeScript } from "scripts/helpers";

import { workspaceIdFromConnectionId } from "@connectors/connectors/notion";
import { NotionConnectorState } from "@connectors/lib/models/notion";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { concurrentExecutor } from "@connectors/types";

async function updateConnector(
  connector: ConnectorResource,
  logger: Logger,
  execute: boolean
) {
  const notionState = await NotionConnectorState.findOne({
    where: { connectorId: connector.id },
  });
  if (!notionState) {
    logger.info(
      { connectorId: connector.id },
      "Notion connector state not found."
    );

    throw new Error("Notion connector state not found.");
  }

  if (notionState.notionWorkspaceId) {
    logger.info(
      { connectorId: connector.id },
      "Notion workspace ID already exists."
    );
    return;
  }

  const workspaceIdRes = await workspaceIdFromConnectionId(
    connector.connectionId
  );

  if (workspaceIdRes.isErr()) {
    logger.error(
      { connectorId: connector.id, error: workspaceIdRes.error },
      "Error getting workspace ID from connection ID"
    );

    throw new Error("Error getting workspace ID from connection ID");
  }

  logger.info(
    {
      connectorId: connector.id,
      notionWorkspaceId: workspaceIdRes.value,
    },
    "Updating Notion connector state..."
  );

  if (!execute) {
    return;
  }

  await NotionConnectorState.update(
    {
      notionWorkspaceId: workspaceIdRes.value,
    },
    { where: { connectorId: connector.id } }
  );
}

async function backfillConnectorStates(logger: Logger, execute: boolean) {
  const connectors = await ConnectorResource.listByType("notion", {});

  await concurrentExecutor(
    connectors,
    async (connector) => updateConnector(connector, logger, execute),
    {
      concurrency: 10,
    }
  );
}

makeScript(
  {
    connectorId: { type: "number", required: false },
  },
  async ({ connectorId, execute }, logger) => {
    if (connectorId) {
      const connectors = await ConnectorResource.fetchByIds("notion", [
        connectorId,
      ]);
      const connector = connectors[0];
      if (connector) {
        await updateConnector(connector, logger, execute);
      }
    } else {
      await backfillConnectorStates(logger, execute);
    }
  }
);
