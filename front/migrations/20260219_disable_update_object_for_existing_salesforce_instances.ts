import { Op } from "sequelize";

import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Logger } from "@app/logger/logger";

const DEPLOYMENT_CUTOFF_DATE = new Date("2026-03-19T00:00:00Z");
const TOOL_NAME = "update_object";
const INTERNAL_MCP_SERVER_NAME = "salesforce";
const PERMISSION_LEVEL = "medium";

async function disableUpdateObjectForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<{ processedCount: number }> {
  // Skip workspaces that had the salesforce_tool_write feature flag enabled.
  // These workspaces were already using update_object, so we should not disable it.
  const hasWriteFlag = await FeatureFlagResource.isEnabledForWorkspace(
    workspace,
    "salesforce_tool_write"
  );

  if (hasWriteFlag) {
    logger.info(
      { workspaceId: workspace.id },
      "Skipping workspace: salesforce_tool_write feature flag is enabled."
    );
    return { processedCount: 0 };
  }

  // Finding all internal MCP server connections created before deployment for this workspace.
  const connections = await MCPServerConnectionModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: {
        [Op.ne]: null,
      },
      createdAt: {
        [Op.lt]: DEPLOYMENT_CUTOFF_DATE,
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
      // Any instance works since they share the same internalMCPServerId key.
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
    "Found Salesforce instances to disable in workspace."
  );

  // Force disable update_object for all existing instances.
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
        "Forced update_object disabled for existing Salesforce instance."
      );
    } else {
      processedCount++;

      instanceLogger.info(
        { instanceCreatedAt: instance.createdAt.toISOString() },
        "Would force update_object disabled for existing Salesforce instance."
      );
    }
  }

  return { processedCount };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    logger.info(
      {
        workspaceId: workspaceId || "all",
        cutoffDate: DEPLOYMENT_CUTOFF_DATE.toISOString(),
        toolName: TOOL_NAME,
        serverName: INTERNAL_MCP_SERVER_NAME,
      },
      "Starting update_object disabling migration for existing Salesforce instances."
    );

    let totalProcessed = 0;

    if (workspaceId) {
      // Process single workspace
      const workspaceResource = await WorkspaceResource.fetchById(workspaceId);
      if (!workspaceResource) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      const workspace = renderLightWorkspaceType({
        workspace: workspaceResource,
      });

      const result = await disableUpdateObjectForWorkspace(
        workspace,
        execute,
        logger
      );
      totalProcessed = result.processedCount;
    } else {
      // Process all workspaces
      await runOnAllWorkspaces(
        async (workspace) => {
          const result = await disableUpdateObjectForWorkspace(
            workspace,
            execute,
            logger
          );
          totalProcessed += result.processedCount;
        },
        { concurrency: 8 }
      );
    }

    logger.info(
      {
        workspaceId: workspaceId || "all",
        processedCount: totalProcessed,
      },
      execute
        ? "Migration completed successfully."
        : "Dry-run completed. Use --execute to apply changes."
    );
  }
);
