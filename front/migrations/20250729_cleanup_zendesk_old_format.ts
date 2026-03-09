import type { Logger } from "pino";
import { QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types/core/core_api";

const BATCH_SIZE = 512;
const CONCURRENCY = 8;

interface ZendeskTicketNode {
  node_id: string;
  id: number;
}

async function getCoreDataSourceId(
  {
    projectId,
    dataSourceId,
  }: {
    projectId: string;
    dataSourceId: string;
  },
  logger: Logger
): Promise<number | null> {
  const coreSequelize = getCorePrimaryDbConnection();

  const [row] = await coreSequelize.query<{ id: number }>(
    `SELECT id
     FROM data_sources
     WHERE project = :projectId
       AND data_source_id = :dataSourceId`,
    {
      replacements: { projectId, dataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  if (!row) {
    logger.error("Core data source not found");
    return null;
  }

  return row.id;
}

async function getZendeskTicketNodeBatch({
  coreDataSourceId,
  nextId,
}: {
  coreDataSourceId: number;
  nextId: number;
}): Promise<{ hasMore: boolean; nextId: number; nodes: ZendeskTicketNode[] }> {
  const coreSequelize = getCorePrimaryDbConnection();

  const nodes = await coreSequelize.query<ZendeskTicketNode>(
    `SELECT id, node_id
     FROM data_sources_nodes
     WHERE data_source = :coreDataSourceId -- leverages the index (data_source, node_id)
       AND node_id LIKE 'zendesk-ticket-%-%'
       AND node_id NOT LIKE 'zendesk-ticket-%-%-%'
       AND id > :nextId
     ORDER BY id
     LIMIT :batchSize`,
    {
      replacements: {
        coreDataSourceId,
        nextId,
        batchSize: BATCH_SIZE,
      },
      type: QueryTypes.SELECT,
    }
  );

  nextId = nodes[nodes.length - 1].id;
  return { nodes, nextId, hasMore: nodes.length === BATCH_SIZE };
}

async function deleteNodeFromCore(
  {
    projectId,
    dataSourceId,
    nodeId,
  }: {
    projectId: string;
    dataSourceId: string;
    nodeId: string;
  },
  logger: Logger
): Promise<void> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const result = await coreAPI.deleteDataSourceDocument({
    projectId,
    dataSourceId,
    documentId: nodeId,
  });

  if (result.isErr()) {
    throw new Error(`Failed to delete node ${nodeId}: ${result.error.message}`);
  }
}

async function processTicketNodes(
  nodes: ZendeskTicketNode[],
  {
    projectId,
    dataSourceId,
    execute,
  }: {
    connectorId: number;
    projectId: string;
    dataSourceId: string;
    execute: boolean;
  },
  logger: Logger
): Promise<void> {
  await concurrentExecutor(
    nodes,
    async ({ node_id }) => {
      const nodeLogger = logger.child({
        nodeId: node_id,
      });

      if (execute) {
        await deleteNodeFromCore(
          {
            projectId,
            dataSourceId,
            nodeId: node_id,
          },
          nodeLogger
        );
        nodeLogger.info("Deleted node from core");
      } else {
        nodeLogger.info("Would delete node from core");
      }
    },
    { concurrency: CONCURRENCY }
  );
}

makeScript(
  {
    connectorId: { type: "number" },
  },
  async ({ execute, connectorId }, logger) => {
    const dataSource = await DataSourceResource.model.findOne({
      where: { connectorId },
    });
    if (!dataSource) {
      logger.error("No data source found for connector ID");
      return;
    }
    const { dustAPIProjectId: projectId, dustAPIDataSourceId: dataSourceId } =
      dataSource;

    const coreDataSourceId = await getCoreDataSourceId(
      {
        projectId,
        dataSourceId,
      },
      logger
    );

    if (!coreDataSourceId) {
      return;
    }

    logger.info({ coreDataSourceId }, "Found core data source");

    let nextId = 0;
    let hasMore = false;

    do {
      const nodesResult = await getZendeskTicketNodeBatch({
        coreDataSourceId,
        nextId,
      });
      nextId = nodesResult.nextId;
      hasMore = nodesResult.hasMore;

      logger.info(
        { nodeCount: nodesResult.nodes.length },
        `Found ticket nodes in core.`
      );

      await processTicketNodes(
        nodesResult.nodes,
        {
          connectorId,
          projectId,
          dataSourceId,
          execute,
        },
        logger
      );
    } while (hasMore);

    logger.info("Cleanup completed");
  }
);
