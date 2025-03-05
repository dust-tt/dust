import { makeScript } from "scripts/helpers";

import { getHelpCenterInternalId } from "@connectors/connectors/intercom/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { deleteDataSourceFolder } from "@connectors/lib/data_sources";
import { IntercomHelpCenterModel } from "@connectors/lib/models/intercom";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

async function cleanupConnector(
  connector: ConnectorResource,
  execute: boolean,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({ connectorId: connector.id });
  logger.info("MIGRATE");

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const helpCenters = await IntercomHelpCenterModel.findAll({
    where: { connectorId: connector.id },
  });

  for (const helpCenter of helpCenters) {
    const folderId = getHelpCenterInternalId(
      connector.id,
      helpCenter.helpCenterId
    );

    if (execute) {
      await deleteDataSourceFolder({ dataSourceConfig, folderId });
      logger.info({ folderId }, "Deleted Help Center folder.");
    } else {
      logger.info({ folderId }, "Would delete Help Center folder.");
    }
  }
}
makeScript({}, async ({ execute }, logger) => {
  const connectors = await ConnectorResource.listByType("intercom", {});

  for (const connector of connectors) {
    await cleanupConnector(connector, execute, logger);
  }
});
