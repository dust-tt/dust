import { Op } from "sequelize";

import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

const DEPLOYMENT_CUTOFF_DATE = new Date("2026-01-28T00:00:00Z");

const TOOL_NAME = "send_mail";
const INTERNAL_MCP_SERVER_NAME = "gmail";
const PERMISSION_LEVEL = "high";

async function disableSendMailForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: any
): Promise<number> {
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
    attributes: ["id", "workspaceId", "internalMCPServerId", "createdAt"],
  });

  // Filter to keep only Gmail instances by decoding the internalMCPServerId.
  // Group by internalMCPServerId to avoid duplicates (personal + workspace connections).
  const uniqueInstancesMap = new Map<
    string,
    {
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
          workspaceId: conn.workspaceId,
          internalMCPServerId: conn.internalMCPServerId,
          createdAt: conn.createdAt,
        });
      }
    }
  }

  const existingInstances = Array.from(uniqueInstancesMap.values());

  if (existingInstances.length === 0) {
    return 0;
  }

  logger.info(
    {
      workspaceId: workspace.id,
      instancesCount: existingInstances.length,
    },
    "Found Gmail instances to disable in workspace."
  );

  // Force disable send_mail for all existing instances using upsert.
  let processedCount = 0;

  for (const instance of existingInstances) {
    if (execute) {
      // Upsert to force enabled: false.
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
        },
        "Forced send_mail disabled for existing Gmail instance."
      );
    } else {
      // DRY-RUN.
      processedCount++;

      logger.info(
        {
          workspaceId: instance.workspaceId,
          internalMCPServerId: instance.internalMCPServerId,
          toolName: TOOL_NAME,
          enabled: false,
          permission: PERMISSION_LEVEL,
          instanceCreatedAt: instance.createdAt.toISOString(),
        },
        "Would force send_mail disabled for existing Gmail instance."
      );
    }
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
  },
  async ({ workspaceId, execute }, logger) => {
    logger.info(
      {
        workspaceId: workspaceId || "all",
        cutoffDate: DEPLOYMENT_CUTOFF_DATE.toISOString(),
        toolName: TOOL_NAME,
        serverName: INTERNAL_MCP_SERVER_NAME,
      },
      "Starting send_mail disabling migration for existing Gmail instances."
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

      totalProcessed = await disableSendMailForWorkspace(
        workspace,
        execute,
        logger
      );
    } else {
      // Process all workspaces
      await runOnAllWorkspaces(
        async (workspace) => {
          const processed = await disableSendMailForWorkspace(
            workspace,
            execute,
            logger
          );
          totalProcessed += processed;
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
