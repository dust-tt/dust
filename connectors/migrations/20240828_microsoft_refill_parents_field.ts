import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { getParents } from "@connectors/connectors/microsoft/temporal/file";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript({}, async ({ execute }) => {
  const connectors = await ConnectorResource.listByType("microsoft", {});
  for (const connector of connectors) {
    logger.info({ connector: connector.toJSON() }, "Processing connector");
    await updateParentsFieldForConnector(connector, execute);
  }
});

async function updateParentsFieldForConnector(
  connector: ConnectorResource,
  execute = false
) {
  // get all nodes (not using resource here since 1-shot clean migration)
  const nodes = await MicrosoftNodeModel.findAll({
    where: {
      connectorId: connector.id,
      nodeType: "file",
      // exclude spreadsheets and csv files (their parents were correct)
      mimeType: {
        [Op.notIn]: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv",
        ],
      },
    },
  });

  const startSyncTs = new Date().getTime();
  const res = await concurrentExecutor(
    nodes,
    async (node) => {
      const parents = await getParents({
        connectorId: connector.id,
        internalId: node.internalId,
        startSyncTs,
      });

      if (!execute) {
        return true;
      }

      return updateDocumentParentsField({
        dataSourceConfig: {
          dataSourceName: connector.dataSourceName,
          workspaceId: connector.workspaceId,
          workspaceAPIKey: connector.workspaceAPIKey,
        },
        documentId: node.internalId,
        parents,
      });
    },
    { concurrency: 10 }
  );

  logger.info(
    {
      connectorId: connector.id,
      updated: res.filter((r) => r).length,
      total: res.length,
    },
    "Updated parents field for connector"
  );
}
