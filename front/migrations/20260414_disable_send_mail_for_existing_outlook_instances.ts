import { Op } from "sequelize";

import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Logger } from "@app/logger/logger";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import type { ModelId } from "@app/types/shared/model_id";

const TOOL_NAME = "send_mail";
const INTERNAL_MCP_SERVER_NAME = "outlook";
const PERMISSION_LEVEL = "high";

async function disableSendMailForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<{ processedCount: number }> {
  const connections = await MCPServerConnectionModel.findAll({
    where: {
      workspaceId: workspace.id,
      serverType: "internal",
      internalMCPServerId: {
        [Op.ne]: null,
      },
    },
    attributes: ["id", "workspaceId", "internalMCPServerId", "createdAt"],
  });

  const uniqueInstancesMap = new Map<
    string,
    {
      workspaceId: ModelId;
      internalMCPServerId: string;
      createdAt: Date;
      mcpServerConnectionId: ModelId;
    }
  >();

  for (const conn of connections) {
    if (!conn.internalMCPServerId) {
      continue;
    }

    const parsed = getInternalMCPServerNameAndWorkspaceId(
      conn.internalMCPServerId
    );
    if (parsed.isOk() && parsed.value.name === INTERNAL_MCP_SERVER_NAME) {
      if (!uniqueInstancesMap.has(conn.internalMCPServerId)) {
        uniqueInstancesMap.set(conn.internalMCPServerId, {
          workspaceId: conn.workspaceId,
          internalMCPServerId: conn.internalMCPServerId,
          createdAt: conn.createdAt,
          mcpServerConnectionId: conn.id,
        });
      }
    }
  }

  const existingInstances = Array.from(uniqueInstancesMap.values());
  if (existingInstances.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "No existing Outlook instances found in workspace."
    );
    return { processedCount: 0 };
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      instancesCount: existingInstances.length,
    },
    "Found Outlook instances to disable send_mail in workspace."
  );

  let processedCount = 0;
  for (const instance of existingInstances) {
    const instanceLogger = logger.child({
      workspaceId: workspace.sId,
      internalMCPServerId: instance.internalMCPServerId,
      mcpServerConnectionId: instance.mcpServerConnectionId,
      instanceCreatedAt: instance.createdAt.toISOString(),
    });

    if (execute) {
      const existingToolMetadata =
        await RemoteMCPServerToolMetadataModel.findOne({
          where: {
            workspaceId: instance.workspaceId,
            internalMCPServerId: instance.internalMCPServerId,
            toolName: TOOL_NAME,
          },
        });
      if (existingToolMetadata) {
        if (existingToolMetadata.enabled) {
          await existingToolMetadata.update({
            enabled: false,
          });
        }
      } else {
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
      const workspaceResource = await WorkspaceResource.fetchById(workspaceId);
      if (!workspaceResource) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      const workspace = renderLightWorkspaceType({
        workspace: workspaceResource,
      });

      const { processedCount } = await disableSendMailForWorkspace(
        workspace,
        execute,
        logger
      );
      totalProcessed = processedCount;
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          const { processedCount } = await disableSendMailForWorkspace(
            workspace,
            execute,
            logger
          );
          totalProcessed += processedCount;
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
