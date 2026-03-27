import { Op } from "sequelize";

import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Logger } from "@app/logger/logger";

const DEFAULT_CUTOFF_DATE = new Date("2026-03-27T00:00:00Z");
const TOOL_NAME = "create_object";
const INTERNAL_MCP_SERVER_NAME = "salesforce";
const PERMISSION_LEVEL = "medium";

async function disableCreateObjectForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger,
  cutoffDate: Date
): Promise<{ processedCount: number }> {
  // Finding all internal MCP server connections created before the cutoff date.
  const connections = await MCPServerConnectionModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: {
        [Op.ne]: null,
      },
      createdAt: {
        [Op.lt]: cutoffDate,
      },
    },
  });

  // Filter to keep only Salesforce instances by decoding the internalMCPServerId.
  // Group by internalMCPServerId to avoid duplicates (personal + workspace connections).
  const uniqueInstancesMap = new Map<
    string,
    {
      connectionId: number;
      workspaceId: number;
      internalMCPServerId: string;
      createdAt: Date;
    }
  >();

  for (const conn of connections) {
    if (!conn.internalMCPServerId) continue;

    const parsed = getInternalMCPServerNameAndWorkspaceId(
      conn.internalMCPServerId
    );

    if (parsed.isOk() && parsed.value.name === INTERNAL_MCP_SERVER_NAME) {
      if (!uniqueInstancesMap.has(conn.internalMCPServerId)) {
        uniqueInstancesMap.set(conn.internalMCPServerId, {
          connectionId: conn.id,
          workspaceId: conn.workspaceId,
          internalMCPServerId: conn.internalMCPServerId,
          createdAt: conn.createdAt,
        });
      }
    }
  }

  const existingInstances = Array.from(uniqueInstancesMap.values());

  if (existingInstances.length === 0) {
    return { processedCount: 0 };
  }

  logger.info(
    {
      workspaceId: workspace.id,
      instancesCount: existingInstances.length,
    },
    "Found Salesforce instances to disable create_object in workspace."
  );

  let processedCount = 0;

  for (const instance of existingInstances) {
    const instanceLogger = logger.child({
      workspaceId: instance.workspaceId,
      connectionId: instance.connectionId,
      internalMCPServerId: instance.internalMCPServerId,
      toolName: TOOL_NAME,
      permission: PERMISSION_LEVEL,
    });

    if (execute) {
      const existing = await RemoteMCPServerToolMetadataModel.findOne({
        where: {
          workspaceId: instance.workspaceId,
          internalMCPServerId: instance.internalMCPServerId,
          toolName: TOOL_NAME,
        },
      });

      if (!existing) {
        await RemoteMCPServerToolMetadataModel.create({
          workspaceId: instance.workspaceId,
          internalMCPServerId: instance.internalMCPServerId,
          toolName: TOOL_NAME,
          permission: PERMISSION_LEVEL,
          enabled: false,
        });
      }

      processedCount++;

      instanceLogger.info(
        { instanceCreatedAt: instance.createdAt.toISOString() },
        "Forced create_object disabled for existing Salesforce instance."
      );
    } else {
      processedCount++;

      instanceLogger.info(
        { instanceCreatedAt: instance.createdAt.toISOString() },
        "Would force create_object disabled for existing Salesforce instance."
      );
    }
  }

  return { processedCount };
}

makeScript(
  {
    cutoffDate: {
      type: "string",
      description:
        "ISO date string for the cutoff date (connections created before this date are affected)",
      required: false,
    },
  },
  async ({ cutoffDate: cutoffDateStr, execute }, logger) => {
    const cutoffDate = cutoffDateStr
      ? new Date(cutoffDateStr)
      : DEFAULT_CUTOFF_DATE;

    if (isNaN(cutoffDate.getTime())) {
      throw new Error(`Invalid cutoff date: ${cutoffDateStr}`);
    }

    logger.info(
      {
        cutoffDate: cutoffDate.toISOString(),
        toolName: TOOL_NAME,
        serverName: INTERNAL_MCP_SERVER_NAME,
      },
      "Starting create_object disabling migration for existing Salesforce instances."
    );

    let totalProcessed = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const result = await disableCreateObjectForWorkspace(
          workspace,
          execute,
          logger,
          cutoffDate
        );
        totalProcessed += result.processedCount;
      },
      { concurrency: 8 }
    );

    logger.info(
      {
        processedCount: totalProcessed,
      },
      execute
        ? "Migration completed successfully."
        : "Dry-run completed. Use --execute to apply changes."
    );
  }
);
