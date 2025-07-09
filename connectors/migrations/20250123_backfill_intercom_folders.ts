import { makeScript } from "scripts/helpers";

import { syncAllTeamsActivity } from "@connectors/connectors/intercom/temporal/activities";
import { IntercomWorkspaceModel } from "@connectors/lib/models/intercom";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function backfillConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({ connectorId: connector.id });
  logger.info("MIGRATE");

  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: { connectorId: connector.id },
  });
  if (!intercomWorkspace) {
    logger.error("No Intercom workspace found.");
    return;
  }

  if (intercomWorkspace.syncAllConversations) {
    if (execute) {
      // The function below performs a fetch to the Intercom API, which is required because we are missing some data in db.
      // For context, only the teams selected by the user were upserted to the db; we now need all of them to sync data with core
      // (if there is no entry in db we cannot delete teams when the user unchecks All Conversations).
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
