import type { ModelId } from "@dust-tt/types";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

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
      where: {
        connectorId,
        parentId: parentIds,
      },
    });
    const childDatabases = await NotionDatabase.findAll({
      where: {
        connectorId,
        parentId: parentIds,
      },
    });

    // Add new descendants to the list and queue their IDs for next iteration
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
  connector: ConnectorResource,
  execute = false,
  nodeConcurrency: number,
  parentLogger: typeof Logger
) {
  const logger = parentLogger.child({
    connectorId: connector.id,
    workspaceId: connector.workspaceId,
  });

  let pagesIdCursor = 0;
  let databasesIdCursor = 0;

  const pageSize = 512;
  let nodes: (NotionPage | NotionDatabase)[] = [];
  for (;;) {
    const pages = await NotionPage.findAll({
      where: {
        connectorId: connector.id,
        id: { [Op.gt]: pagesIdCursor },
        parentId: "unknown",
      },
      limit: pageSize,
      order: [["id", "ASC"]],
    });
    const databases = await NotionDatabase.findAll({
      where: {
        connectorId: connector.id,
        id: { [Op.gt]: databasesIdCursor },
        parentId: "unknown",
      },
      limit: pageSize,
      order: [["id", "ASC"]],
    });

    nodes = [...pages, ...databases];

    const descendants: (NotionPage | NotionDatabase)[] =
      await findAllDescendants(nodes, connector.id);

    if (pages.length > 0) {
      const newCursor = pages[pages.length - 1]?.id;
      if (!newCursor) {
        throw new Error("Last page is undefined");
      }
      pagesIdCursor = newCursor;
    }
    if (databases.length > 0) {
      const newCursor = databases[databases.length - 1]?.id;
      if (!newCursor) {
        throw new Error("Last database is undefined");
      }
      databasesIdCursor = newCursor;
    }

    nodes = [...pages, ...databases];
    if (!nodes.length) {
      break;
    }

    // Find all descendants of nodes with "unknown" parentId and update them
    nodes = [...nodes, ...descendants];

    const res = await concurrentExecutor(
      nodes,
      async (node) => {
        let parents: string[] | null = null;
        try {
          parents = await getParents(
            connector.id,
            "notionPageId" in node ? node.notionPageId : node.notionDatabaseId,
            [],
            false,
            undefined,
            undefined
          );
        } catch (e) {
          logger.error(`Error getting parents for node ${node.id}: ${e}`);
          return;
        }

        let documentId: string | null = null;
        let tableId: string | null = null;

        if ("notionPageId" in node) {
          // its a page
          if (node.lastUpsertedTs) {
            documentId = `notion-${node.notionPageId}`;
          }
        } else {
          if (node.structuredDataUpsertedTs) {
            tableId = `notion-${node.notionDatabaseId}`;
          }

          documentId = `notion-database-${node.notionDatabaseId}`;
        }

        if (execute) {
          try {
            if (documentId) {
              await updateDataSourceDocumentParents({
                dataSourceConfig: dataSourceConfigFromConnector(connector),
                documentId,
                parents,
                parentId: parents[1] || null,
                retries: 3,
              });
            }
            if (tableId) {
              await updateDataSourceTableParents({
                dataSourceConfig: dataSourceConfigFromConnector(connector),
                tableId,
                parents,
                parentId: parents[1] || null,
                retries: 3,
              });
            }
          } catch (e) {
            logger.error(`Error updating parents for node ${node.id}: ${e}`);
          }
        }
      },
      { concurrency: nodeConcurrency }
    );

    logger.info(
      { pagesIdCursor, databasesIdCursor },
      `Processed ${res.length} nodes.`
    );
  }

  logger.info("DONE");
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
    const connectors = await ConnectorResource.listByType("notion", {});

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
        logger.info({ connector }, "MIGRATE");
        await updateParentsFieldForConnector(
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
