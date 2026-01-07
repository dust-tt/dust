import { Op } from "sequelize";

import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { makeScript } from "@app/scripts/helpers";

const DEPLOYMENT_CUTOFF_DATE = new Date("2026-01-08T00:00:00Z");

const TOOL_NAME = "send_mail";
const INTERNAL_MCP_SERVER_NAME = "gmail";
const PERMISSION_LEVEL = "high";

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    {
      execute,
      cutoffDate: DEPLOYMENT_CUTOFF_DATE.toISOString(),
      toolName: TOOL_NAME,
      serverName: INTERNAL_MCP_SERVER_NAME,
    },
    "Starting send_mail disabling migration for existing Gmail instances."
  );

  // Finding all internal MCP server connections created before deployment.

  const allConnections = await MCPServerConnectionModel.findAll({
    where: {
      serverType: "internal",
      internalMCPServerId: {
        [Op.ne]: null,
      },
      createdAt: {
        [Op.lt]: DEPLOYMENT_CUTOFF_DATE,
      },
    },
    attributes: ["id", "workspaceId", "internalMCPServerId", "createdAt"],
  });

  // Filter to keep only Gmail instances by decoding the internalMCPServerId.
  // Group by workspace + serverId to avoid duplicates (personal + workspace connections).

  const uniqueInstancesMap = new Map<
    string,
    {
      workspaceId: number;
      internalMCPServerId: string;
      createdAt: Date;
    }
  >();

  for (const conn of allConnections) {
    if (!conn.internalMCPServerId) continue;

    const parsed = getInternalMCPServerNameAndWorkspaceId(
      conn.internalMCPServerId
    );

    if (parsed.isOk() && parsed.value.name === INTERNAL_MCP_SERVER_NAME) {
      const key = `${conn.workspaceId}:${conn.internalMCPServerId}`;
      // Keep the earliest connection for each workspace+server combination
      const existing = uniqueInstancesMap.get(key);
      if (!existing || conn.createdAt < existing.createdAt) {
        uniqueInstancesMap.set(key, {
          workspaceId: conn.workspaceId,
          internalMCPServerId: conn.internalMCPServerId,
          createdAt: conn.createdAt,
        });
      }
    }
  }

  const existingInstances = Array.from(uniqueInstancesMap.values());

  logger.info(
    {
      execute,
      totalInstances: existingInstances.length,
      cutoffDate: DEPLOYMENT_CUTOFF_DATE.toISOString(),
    },
    "Found existing Gmail instances to disable."
  );

  if (existingInstances.length === 0) {
    logger.info({ execute }, "No existing Gmail instances found. Stopping.");
    return;
  }

  // Force disable send_mail for all existing instances using upsert.

  let processedCount = 0;

  for (const instance of existingInstances) {
    if (execute) {
      // EXÉCUTION RÉELLE - upsert to force enabled: false
      await RemoteMCPServerToolMetadataModel.upsert(
        {
          workspaceId: instance.workspaceId,
          internalMCPServerId: instance.internalMCPServerId,
          toolName: TOOL_NAME,
          permission: PERMISSION_LEVEL,
          enabled: false,
        },
        {
          conflictFields: ["workspaceId", "internalMCPServerId", "toolName"],
        }
      );

      processedCount++;

      logger.info(
        {
          workspaceId: instance.workspaceId,
          internalMCPServerId: instance.internalMCPServerId,
          toolName: TOOL_NAME,
          enabled: false,
          permission: PERMISSION_LEVEL,
          instanceCreatedAt: instance.createdAt.toISOString(),
          execute,
        },
        "Forced send_mail disabled for existing Gmail instance."
      );
    } else {
      // DRY-RUN
      processedCount++;

      logger.info(
        {
          workspaceId: instance.workspaceId,
          internalMCPServerId: instance.internalMCPServerId,
          toolName: TOOL_NAME,
          enabled: false,
          permission: PERMISSION_LEVEL,
          instanceCreatedAt: instance.createdAt.toISOString(),
          execute,
        },
        "Would force send_mail disabled for existing Gmail instance."
      );
    }
  }

  logger.info(
    {
      execute,
      processedCount,
      totalToProcess: existingInstances.length,
    },
    execute
      ? "Migration completed successfully."
      : "Dry-run completed. Use --execute to apply changes."
  );
});
