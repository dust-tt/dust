import type { ModelId } from "@dust-tt/types";
import { CoreAPI, EnvironmentConfig } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";
import { Op, QueryTypes, Sequelize } from "sequelize";

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
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const PAGE_SIZE = 1000;
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

async function updateNodeParents({
  node,
  connector,
  dataSourceConfig,
  execute,
  logger,
}: {
  node: NotionPage | NotionDatabase;
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  execute: boolean;
  logger: typeof Logger;
}) {
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
        dataSourceConfig,
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
        { parents: [documentId, ...parents], nodeId: documentId },
        "DRY"
      );
    }
  }
}

/**
 * Computes the extra nodes given the IDs returned by core.
 */
async function getExtraNodes(
  coreNotionIds: string[],
  connector: ConnectorResource
): Promise<(NotionPage | NotionDatabase)[]> {
  const pages = await NotionPage.findAll({
    where: {
      connectorId: connector.id,
      notionPageId: coreNotionIds,
      parentType: { [Op.ne]: "workspace" },
    },
  });
  const databases = await NotionDatabase.findAll({
    where: {
      connectorId: connector.id,
      notionDatabaseId: coreNotionIds,
      parentType: { [Op.ne]: "workspace" },
    },
  });

  return [...pages, ...databases];
}

/**
 * Computes the missing nodes given the IDs returned by core.
 */
async function getMissingNodes(
  notionIds: string[],
  connector: ConnectorResource
): Promise<(NotionPage | NotionDatabase)[]> {
  const pages = await NotionPage.findAll({
    where: {
      connectorId: connector.id,
      notionPageId: { [Op.notIn]: notionIds },
      parentType: "workspace",
    },
  });
  const databases = await NotionDatabase.findAll({
    where: {
      connectorId: connector.id,
      notionDatabaseId: { [Op.notIn]: notionIds },
      parentType: "workspace",
    },
  });

  return [...pages, ...databases];
}

async function getDataSourceId(
  connector: ConnectorResource,
  frontSequelize: Sequelize
) {
  const dataSourceRows = await frontSequelize.query(
    `SELECT "dustAPIDataSourceId"
     FROM data_sources
     WHERE "connectorId" = :connectorId`,
    {
      replacements: { connectorId: connector.id.toString() },
      type: QueryTypes.SELECT,
    }
  );

  if (dataSourceRows.length === 0) {
    throw new Error(`No data source found for connector ${connector.id}`);
  }
  const dataSource = dataSourceRows[0] as { dustAPIDataSourceId: string };
  return dataSource.dustAPIDataSourceId;
}

async function updateParentsFieldForConnector({
  coreAPI,
  frontSequelize,
  connector,
  handleExtraNodes,
  handleMissingNodes,
  execute,
  nodeConcurrency,
  parentLogger,
}: {
  coreAPI: CoreAPI;
  frontSequelize: Sequelize;
  connector: ConnectorResource;
  handleExtraNodes: boolean;
  handleMissingNodes: boolean;
  execute: boolean;
  nodeConcurrency: number;
  parentLogger: typeof Logger;
}) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const logger = parentLogger.child({
    connectorId: connector.id,
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceId: dataSourceConfig.dataSourceId,
  });

  const dustAPIDataSourceId = await getDataSourceId(connector, frontSequelize);
  logger.info({ dustAPIDataSourceId }, "MIGRATE");

  let nodeCount = 0;
  let nextPageCursor: string | null = null;

  do {
    const coreRes = await coreAPI.searchNodes({
      filter: {
        data_source_views: [
          { data_source_id: dustAPIDataSourceId, view_filter: [] },
        ],
        parent_id: "root",
      },
      options: { limit: PAGE_SIZE, cursor: nextPageCursor ?? undefined },
    });

    if (coreRes.isErr()) {
      throw new Error(coreRes.error.message);
    }
    nextPageCursor = coreRes.value.next_page_cursor;

    const notionIds = coreRes.value.nodes.map((node) =>
      node.node_id.replace("notion-", "")
    );

    let nodes: (NotionPage | NotionDatabase)[] = [
      ...(handleExtraNodes ? await getExtraNodes(notionIds, connector) : []),
      ...(handleMissingNodes
        ? await getMissingNodes(notionIds, connector)
        : []),
    ];
    const descendants = await findAllDescendants(nodes, connector.id);
    nodes = [...nodes, ...descendants];

    const res = await concurrentExecutor(
      nodes,
      async (node) => {
        await updateNodeParents({
          node,
          connector,
          dataSourceConfig,
          execute,
          logger,
        });
      },
      { concurrency: nodeConcurrency }
    );
    nodeCount += res.length;
  } while (nextPageCursor);

  logger.info({ nodeCount }, "DONE");
}

makeScript(
  {
    connectorConcurrency: {
      type: "number",
      demandOption: false,
      default: 5,
      description: "Number of connectors to process concurrently.",
    },
    nodeConcurrency: {
      type: "number",
      demandOption: false,
      default: 8,
      description: "Number of nodes to process concurrently per connector.",
    },
    extra: {
      boolean: true,
      description: "Recompute parents for extra nodes from core.",
    },
    missing: {
      boolean: true,
      description: "Recompute parents for missing nodes from core.",
    },
    connectorId: {
      type: "number",
      demandOption: false,
      description:
        "ID of the connector to process, leave empty to process all Notion connectors.",
    },
  },
  async (
    {
      execute,
      connectorConcurrency,
      nodeConcurrency,
      extra,
      missing,
      connectorId,
    },
    logger
  ) => {
    if (!extra && !missing) {
      logger.info(
        "Nothing to compute (neither extra nor missing nodes), exiting."
      );
      return;
    }
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

    let connectors;
    if (connectorId) {
      const connector = await ConnectorResource.fetchById(connectorId);
      if (!connector || connector.errorType) {
        throw new Error("Connector not found or is errored.");
      }
      connectors = [connector];
    } else {
      const allConnectors = await ConnectorResource.listByType("notion", {});
      logger.info(`Found ${allConnectors.length} Notion connectors`);

      connectors = allConnectors.filter((c) => !c.errorType);
      logger.info(
        { connectorConcurrency, nodeConcurrency },
        `Processing ${connectors.length} valid connectors.`
      );
    }

    await concurrentExecutor(
      connectors,
      async (connector) => {
        await updateParentsFieldForConnector({
          coreAPI,
          frontSequelize,
          connector,
          handleExtraNodes: extra,
          handleMissingNodes: missing,
          execute,
          nodeConcurrency,
          parentLogger: logger,
        });
      },
      { concurrency: connectorConcurrency }
    );

    logger.info("Finished processing all connectors");
  }
);
