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
): Promise<number> {
  const connections = await MCPServerConnectionModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: { [Op.ne]: null },
      createdAt: { [Op.lt]: cutoffDate },
    },
  });

  // Deduplicate by internalMCPServerId, keeping only Salesforce instances.
  const salesforceServerIds = new Set<string>();
  for (const conn of connections) {
    if (!conn.internalMCPServerId) continue;
    const parsed = getInternalMCPServerNameAndWorkspaceId(
      conn.internalMCPServerId
    );
    if (parsed.isOk() && parsed.value.name === INTERNAL_MCP_SERVER_NAME) {
      salesforceServerIds.add(conn.internalMCPServerId);
    }
  }

  let processedCount = 0;

  for (const serverId of salesforceServerIds) {
    const instanceLogger = logger.child({
      workspaceId: workspace.id,
      internalMCPServerId: serverId,
      toolName: TOOL_NAME,
    });

    if (execute) {
      const [record, created] =
        await RemoteMCPServerToolMetadataModel.findOrCreate({
          where: {
            workspaceId: workspace.id,
            internalMCPServerId: serverId,
            toolName: TOOL_NAME,
          },
          defaults: {
            workspaceId: workspace.id,
            internalMCPServerId: serverId,
            toolName: TOOL_NAME,
            permission: PERMISSION_LEVEL,
            enabled: false,
          },
        });

      if (!created && record.enabled) {
        await record.update({ enabled: false });
      }
    }

    processedCount++;
    instanceLogger.info(
      execute
        ? "Disabled create_object for Salesforce instance."
        : "Would disable create_object for Salesforce instance."
    );
  }

  return processedCount;
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
      { cutoffDate: cutoffDate.toISOString() },
      "Starting create_object disabling migration."
    );

    let totalProcessed = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        totalProcessed += await disableCreateObjectForWorkspace(
          workspace,
          execute,
          logger,
          cutoffDate
        );
      },
      { concurrency: 8 }
    );

    logger.info(
      { processedCount: totalProcessed },
      execute
        ? "Migration completed successfully."
        : "Dry-run completed. Use --execute to apply changes."
    );
  }
);
