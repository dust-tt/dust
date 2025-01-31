import type { ModelId } from "@dust-tt/types";
import { CoreAPI, EnvironmentConfig } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";
import { Op, Sequelize } from "sequelize";

import { getParents } from "@connectors/connectors/notion/lib/parents";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  updateDataSourceDocumentParents,
  updateDataSourceTableParents,
} from "@connectors/lib/data_sources";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const { FRONT_DATABASE_URI } = process.env;

async function findAllDescendants(
  nodes: (NotionPage | NotionDatabase)[],
  connectorId: ModelId
): Promise<(NotionPage | NotionDatabase)[]> {
  const getNodeId = (node: NotionPage | NotionDatabase) =>
    "notionPageId" in node ? node.notionPageId : node.notionDatabaseId;

  const descendants: (NotionPage | NotionDatabase)[] = [];
  const seen = new Set<string>();

  const nodeIds = nodes.map(getNodeId);
  while (nodeIds.length > 0) {
    const parentIds = nodeIds.splice(0, nodeIds.length);

    const childPages = await NotionPage.findAll({
      where: { connectorId, parentId: parentIds },
    });
    const childDatabases = await NotionDatabase.findAll({
      where: { connectorId, parentId: parentIds },
    });

    for (const node of [...childPages, ...childDatabases]) {
      const nodeId = getNodeId(node);
      if (!seen.has(nodeId)) {
        seen.add(nodeId);
        descendants.push(node);
        nodeIds.push(nodeId);
      }
    }
  }

  return descendants;
}

async function updateParentsFieldForConnector(
  coreAPI: CoreAPI,
  frontSequelize: Sequelize,
  connector: ConnectorResource,
  execute = false,
  nodeConcurrency: number,
  parentLogger: typeof Logger
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const logger = parentLogger.child({
    connectorId: connector.id,
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceId: dataSourceConfig.dataSourceId,
  });

  const [dataSourceRows] = await frontSequelize.query(
    `SELECT "dustAPIDataSourceId" FROM data_sources WHERE "connectorId" = :connectorId`,
    {
      replacements: { connectorId: connector.id.toString() },
    }
  );

  if (dataSourceRows.length === 0) {
    throw new Error(`No data source found for connector ${connector.id}`);
  }
  const dataSource = dataSourceRows[0] as { dustAPIDataSourceId: string };
  const dustAPIDataSourceId = dataSource.dustAPIDataSourceId;

  logger.info({ dustAPIDataSourceId }, "DataSourceId retrieved.");

  const coreRes = await coreAPI.searchNodes({
    filter: {
      data_source_views: [
        {
          data_source_id: dustAPIDataSourceId,
          view_filter: [],
        },
      ],
      parent_id: "root",
    },
    options: {
      limit: 1000,
      sort: [
        { field: "node_type", direction: "desc" },
        { field: "title.keyword", direction: "asc" },
      ],
    },
  });

  if (coreRes.isErr()) {
    throw new Error(coreRes.error.message);
  }

  const notionIds = coreRes.value.nodes.map((node) =>
    node.node_id.replace("notion-", "")
  );

  let nodes: (NotionPage | NotionDatabase)[] = [];
  const pages = await NotionPage.findAll({
    where: {
      connectorId: connector.id,
      notionPageId: notionIds,
      parentType: { [Op.ne]: "workspace" },
    },
  });
  const databases = await NotionDatabase.findAll({
    where: {
      connectorId: connector.id,
      notionDatabaseId: notionIds,
      parentType: { [Op.ne]: "workspace" },
    },
  });

  nodes = [...pages, ...databases];

  const descendants: (NotionPage | NotionDatabase)[] = await findAllDescendants(
    nodes,
    connector.id
  );

  // Find all descendants of nodes with "unknown" parentId and update them
  nodes = [...nodes, ...descendants];

  const res = await concurrentExecutor(
    nodes,
    async (node) => {
      const parentNotionIds = await getParents(
        connector.id,
        "notionPageId" in node ? node.notionPageId : node.notionDatabaseId,
        [],
        false,
        undefined,
        undefined
      );
      const parents = parentNotionIds.map((id) => `notion-${id}`);

      if ("notionPageId" in node) {
        if (!node.lastUpsertedTs) {
          logger.info({ node }, "No lastUpsertedTs");
        }
        const documentId = `notion-${node.notionPageId}`;
        if (execute) {
          await updateDataSourceDocumentParents({
            dataSourceConfig: dataSourceConfigFromConnector(connector),
            documentId,
            parents,
            parentId: parents[1] || null,
          });
        } else {
          logger.info({ parents, nodeId: documentId }, "DRY");
        }
      } else {
        if (node.structuredDataUpsertedTs) {
          const tableId = `notion-${node.notionDatabaseId}`;
          if (execute) {
            await updateDataSourceTableParents({
              dataSourceConfig,
              tableId,
              parents,
              parentId: parents[1] || null,
            });
          } else {
            logger.info({ parents, nodeId: tableId }, "DRY");
          }
        }
        const documentId = `notion-database-${node.notionDatabaseId}`;
        if (execute) {
          await updateDataSourceDocumentParents({
            dataSourceConfig,
            documentId,
            parents: [documentId, ...parents],
            parentId: parents[0] || null,
          });
        } else {
          logger.info(
            { parents: [documentId, ...documentId], nodeId: documentId },
            "DRY"
          );
        }
      }
    },
    { concurrency: nodeConcurrency }
  );

  logger.info({ nodeCount: res.length }, "DONE");
}

makeScript(
  {
    connectorConcurrency: {
      type: "number",
      demandOption: false,
      default: 5,
      description: "Number of connectors to process concurrently",
    },
    nodeConcurrency: {
      type: "number",
      demandOption: false,
      default: 8,
      description: "Number of nodes to process concurrently per connector",
    },
  },
  async ({ execute, connectorConcurrency, nodeConcurrency }, logger) => {
    const coreAPI = new CoreAPI(
      {
        url: EnvironmentConfig.getEnvVariable("CORE_API"),
        apiKey:
          EnvironmentConfig.getOptionalEnvVariable("CORE_API_KEY") ?? null,
      },
      logger
    );
    const frontSequelize = new Sequelize(FRONT_DATABASE_URI as string, {
      logging: false,
    });

    const connectors = await ConnectorResource.fetchByIds("notion", [47]);

    logger.info(`Found ${connectors.length} Notion connectors`);

    const validConnectors = connectors.filter(
      (connector) => !connector.errorType
    );
    logger.info(
      { connectorConcurrency, nodeConcurrency },
      `Processing ${validConnectors.length} valid connectors.`
    );

    await concurrentExecutor(
      validConnectors,
      async (connector) => {
        logger.info({ connectorId: connector.id }, "MIGRATE");
        await updateParentsFieldForConnector(
          coreAPI,
          frontSequelize,
          connector,
          execute,
          nodeConcurrency,
          logger
        );
      },
      { concurrency: connectorConcurrency }
    );

    logger.info("Finished processing all connectors");
  }
);
