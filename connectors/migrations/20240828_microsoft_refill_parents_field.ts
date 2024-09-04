import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { getParents } from "@connectors/connectors/microsoft/temporal/file";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    connectorId: { type: "number", demandOption: false },
  },
  async ({ execute, connectorId }) => {
    if (connectorId) {
      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector) {
        throw new Error(`Connector with id ${connectorId} not found`);
      }
      await updateParentsFieldForConnector(connector, execute);
      return;
    }

    const connectors = await ConnectorResource.listByType("microsoft", {});
    console.log(`Found ${connectors.length} Microsoft connectors, pick one`);
    for (const connector of connectors) {
      console.log(
        `Workspace ${connector.workspaceId}:  connector ${connector.id}`
      );
    }
  }
);

async function updateParentsFieldForConnector(
  connector: ConnectorResource,
  execute = false
) {
  let idCursor = 0;

  const pageSize = 512;

  let nodes: MicrosoftNodeModel[] = [];
  do {
    nodes = await MicrosoftNodeModel.findAll({
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
        id: {
          [Op.gte]: idCursor,
        },
      },
      limit: pageSize,
      order: [["id", "ASC"]],
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
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          documentId: node.internalId,
          parents,
        });
      },
      { concurrency: 8 }
    );

    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      if (!lastNode) {
        throw new Error("Last node is undefined");
      }
      idCursor = lastNode.id + 1;
    }

    console.log(`Processed ${res.length} nodes, new cursor ${idCursor}`);
  } while (nodes.length > 0);

  console.log(
    `Finished processing connector ${connector.id} (workspace ${connector.workspaceId})`
  );
}
