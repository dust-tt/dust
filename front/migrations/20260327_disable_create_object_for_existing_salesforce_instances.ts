import { Op } from "sequelize";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { SALESFORCE_TOOLS_METADATA } from "@app/lib/api/actions/servers/salesforce/metadata";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Logger } from "@app/logger/logger";

const DEFAULT_CUTOFF_DATE = new Date("2026-03-27T00:00:00Z");
const TOOL_NAME: keyof typeof SALESFORCE_TOOLS_METADATA = "create_object";
const INTERNAL_MCP_SERVER_NAME: InternalMCPServerNameType = "salesforce";
const PERMISSION_LEVEL: MCPToolStakeLevelType = "medium";

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

  if (salesforceServerIds.size > 0) {
    logger.info(
      { workspaceId: workspace.sId, count: salesforceServerIds.size },
      "Salesforce instances to process."
    );
  }

  let processedCount = 0;

  for (const serverId of salesforceServerIds) {
    const instanceLogger = logger.child({
      workspaceId: workspace.sId,
      internalMCPServerId: serverId,
      toolName: TOOL_NAME,
    });

    if (execute) {
      const existing = await RemoteMCPServerToolMetadataModel.findOne({
        where: {
          workspaceId: workspace.id,
          internalMCPServerId: serverId,
          toolName: TOOL_NAME,
        },
      });

      if (!existing) {
        const created = await RemoteMCPServerToolMetadataModel.create({
          workspaceId: workspace.id,
          internalMCPServerId: serverId,
          toolName: TOOL_NAME,
          permission: PERMISSION_LEVEL,
          enabled: false,
        });
        instanceLogger.info(
          { metadataId: created.id, action: "created" },
          "Disabled create_object for Salesforce instance."
        );
      } else if (existing.enabled) {
        await existing.update({ enabled: false });
        instanceLogger.info(
          { metadataId: existing.id, action: "updated" },
          "Disabled create_object for Salesforce instance."
        );
      } else {
        instanceLogger.info(
          { metadataId: existing.id, action: "skipped" },
          "Already disabled, skipping."
        );
      }
    } else {
      instanceLogger.info(
        "Would disable create_object for Salesforce instance."
      );
    }

    processedCount++;
  }

  return processedCount;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
    cutoffDate: {
      type: "string",
      description:
        "ISO date string for the cutoff date (connections created before this date are affected)",
      required: false,
    },
  },
  async ({ workspaceId, cutoffDate: cutoffDateStr, execute }, logger) => {
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

    if (workspaceId) {
      const workspaceResource = await WorkspaceResource.fetchById(workspaceId);
      if (!workspaceResource) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      const workspace = renderLightWorkspaceType({
        workspace: workspaceResource,
      });
      totalProcessed += await disableCreateObjectForWorkspace(
        workspace,
        execute,
        logger,
        cutoffDate
      );
    } else {
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
    }

    logger.info(
      { processedCount: totalProcessed },
      execute
        ? "Migration completed successfully."
        : "Dry-run completed. Use --execute to apply changes."
    );
  }
);
