import type { Logger } from "pino";
import { QueryTypes } from "sequelize";

import config from "@app/lib/api/config";
import {
  getConnectorsPrimaryDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types/core/core_api";

const BATCH_SIZE = 512;
const CONCURRENCY = 8;

interface ZendeskTicketNode {
  node_id: string;
  id: number;
}

interface ConnectorTicket {
  ticketId: number;
  brandId: number;
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

  // eslint-disable-next-line dust/no-raw-sql
  const [row] = await coreSequelize.query<{ id: number }>(
    `SELECT id FROM data_sources WHERE project = :projectId AND data_source_id = :dataSourceId`,
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

  // eslint-disable-next-line dust/no-raw-sql
  const nodes = await coreSequelize.query<ZendeskTicketNode>(
    `SELECT id, node_id
       FROM data_sources_nodes
       WHERE data_source = :coreDataSourceId
         AND node_id LIKE 'zendesk-ticket-%'
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

function parseZendeskTicketNodeId(nodeId: string): {
  connectorId: number;
  brandId: number;
  ticketId: number;
} | null {
  // Expected format: zendesk-ticket-{connectorId}-{brandId}-{ticketId}.
  const match = nodeId.match(/^zendesk-ticket-(\d+)-(\d+)-(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    connectorId: parseInt(match[1], 10),
    brandId: parseInt(match[2], 10),
    ticketId: parseInt(match[3], 10),
  };
}

async function checkTicketsExistInConnectors({
  connectorId,
  ticketIds,
}: {
  connectorId: number;
  ticketIds: { brandId: number; ticketId: number }[];
}): Promise<Set<string>> {
  const connectorsSequelize = getConnectorsPrimaryDbConnection();

  if (ticketIds.length === 0) {
    return new Set();
  }

  const ticketPairs = ticketIds
    .map((t) => `(${t.brandId}, ${t.ticketId})`)
    .join(", ");

  // eslint-disable-next-line dust/no-raw-sql
  const existingTickets = await connectorsSequelize.query<ConnectorTicket>(
    `SELECT "ticketId", "brandId" 
     FROM zendesk_tickets 
     WHERE "connectorId" = :connectorId 
       AND ("brandId", "ticketId") IN (${ticketPairs})`,
    {
      replacements: {
        connectorId,
      },
      type: QueryTypes.SELECT,
    }
  );

  return new Set(existingTickets.map((t) => `${t.brandId}-${t.ticketId}`));
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
    connectorId,
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
  // Parse all ticket IDs and validate their format.
  const parsedNodes = nodes
    .map((node) => ({
      node,
      parsed: parseZendeskTicketNodeId(node.node_id),
    }))
    .filter(({ parsed, node }) => {
      if (!parsed) {
        logger.warn(`Invalid ticket node ID format: ${node.node_id}`);
        return false;
      }
      if (parsed.connectorId !== connectorId) {
        logger.warn(
          `Node ${node.node_id} has connector ID ${parsed.connectorId}, expected ${connectorId}`
        );
        return false;
      }
      return true;
    });

  if (parsedNodes.length === 0) {
    logger.info("No valid ticket nodes to process");
    return;
  }

  const ticketIds = parsedNodes.map(({ parsed }) => ({
    brandId: parsed!.brandId,
    ticketId: parsed!.ticketId,
  }));

  // Check which tickets exist in connectors db.
  const existingTickets = await checkTicketsExistInConnectors({
    connectorId,
    ticketIds,
  });

  const nodesToDelete = parsedNodes.filter(({ parsed }) => {
    const ticketKey = `${parsed!.brandId}-${parsed!.ticketId}`;
    return !existingTickets.has(ticketKey);
  });

  logger.info(
    { nodesToDelete: nodesToDelete.length, nodesChecked: parsedNodes.length },
    `Found nodes to delete.`
  );

  if (nodesToDelete.length === 0) {
    return;
  }

  // Delete nodes that don't exist in connectors database
  await concurrentExecutor(
    nodesToDelete,
    async ({ node, parsed }) => {
      const nodeLogger = logger.child({
        nodeId: node.node_id,
        brandId: parsed!.brandId,
        ticketId: parsed!.ticketId,
      });

      if (execute) {
        await deleteNodeFromCore(
          {
            projectId,
            dataSourceId,
            nodeId: node.node_id,
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
    projectId: { type: "string" },
    dataSourceId: { type: "string" },
  },
  async ({ execute, connectorId, projectId, dataSourceId }, logger) => {
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
