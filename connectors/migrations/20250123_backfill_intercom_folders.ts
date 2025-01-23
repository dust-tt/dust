import { makeScript } from "scripts/helpers";

import { syncAllTeamsActivity } from "@connectors/connectors/intercom/temporal/activities";
import { IntercomWorkspace } from "@connectors/lib/models/intercom";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function backfillConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({ connectorId: connector.id });
  logger.info("MIGRATE");

  const intercomWorkspace = await IntercomWorkspace.findOne({
    where: { connectorId: connector.id },
  });
  if (!intercomWorkspace) {
    logger.error("No Intercom workspace found.");
    return;
  }

  if (intercomWorkspace.syncAllConversations) {
    if (execute) {
      await syncAllTeamsActivity({
        connectorId: connector.id,
        currentSyncMs: Date.now(),
      });
      logger.info("Synced all teams.");
    } else {
      logger.info("Would have synced all teams.");
    }
  } else {
    logger.info("syncAllConversations not enabled.");
  }
}
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("intercom", {});

  for (const connector of connectors) {
    await backfillConnector(connector, execute, logger);
  }
});
