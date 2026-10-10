import { Op } from "sequelize";

import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";

const TOOL_NAME = "send_mail";
const INTERNAL_MCP_SERVER_NAME = "outlook";
const PERMISSION_LEVEL = "high";

async function disableSendMailForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<{ processedCount: number }> {
  // Finding all internal MCP server connections for this workspace.
  const connections = await MCPServerConnectionModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: {
        [Op.ne]: null,
      },
    },
  });

  // Filter to keep only Outlook instances by decoding the internalMCPServerId.
  // Group by internalMCPServerId to avoid duplicates (personal + workspace connections).
  const uniqueInstancesMap = new Map<
    string,
    {
      connectionId: ModelId;
      workspaceId: ModelId;
      internalMCPServerId: string;
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
        });
      }
    }
  }

  const existingInstances = Array.from(uniqueInstancesMap.values());

  if (existingInstances.length === 0) {
    logger.info(
      { workspaceSId: workspace.sId },
      "No Outlook instances found in workspace."
    );
    return { processedCount: 0 };
  }

  logger.info(
    {
      workspaceSId: workspace.sId,
      instancesCount: existingInstances.length,
    },
    "Found Outlook instances to disable in workspace."
  );

  // Force disable send_mail for all existing instances.
  let processedCount = 0;

  for (const instance of existingInstances) {
    const instanceLogger = logger.child({
      workspaceSId: workspace.sId,
      connectionId: instance.connectionId,
      internalMCPServerId: instance.internalMCPServerId,
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
        "Forced send_mail disabled for existing Outlook instance."
      );
    } else {
      processedCount++;

      instanceLogger.info(
        "Would force send_mail disabled for existing Outlook instance."
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
        toolName: TOOL_NAME,
        serverName: INTERNAL_MCP_SERVER_NAME,
      },
      "Starting send_mail disabling migration for existing Outlook instances."
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

      const result = await disableSendMailForWorkspace(
        workspace,
        execute,
        logger
      );
      totalProcessed = result.processedCount;
    } else {
      // Process all workspaces
      await runOnAllWorkspaces(
        async (workspace) => {
          const result = await disableSendMailForWorkspace(
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
