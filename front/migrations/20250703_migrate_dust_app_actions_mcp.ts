import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { AgentDustAppRunAction } from "@app/lib/models/assistant/actions/dust_app_run";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

const BATCH_SIZE = 200;
const CREATION_CONCURRENCY = 50;
const NOT_FOUND_MCP_SERVER_CONFIGURATION_ID = "unknown";

/**
 * Migrates dust app run actions from non-MCP to MCP version for a specific workspace.
 */
async function migrateWorkspaceDustAppRunActions({
  workspaceModelId,
  execute,
  parentLogger,
}: {
  workspaceModelId: ModelId;
  execute: boolean;
  parentLogger: Logger;
}) {
  const workspace = await WorkspaceModel.findByPk(workspaceModelId);

  if (!workspace) {
    throw new Error(`Workspace ${workspaceModelId} not found`);
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const mcpServerViewForDustAppRun =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "run_dust_app"
    );

  assert(mcpServerViewForDustAppRun, "Dust App Run MCP server view must exist");

  let hasMore = false;
  let lastId = 0;
  do {
    // Step 1: Retrieve the legacy Dust App Run actions.
    const dustAppRunActions = await AgentDustAppRunAction.findAll({
      where: {
        workspaceId: workspaceModelId,
        id: {
          [Op.gt]: lastId,
        },
      },
      limit: BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    if (dustAppRunActions.length === 0) {
      return;
    }
    parentLogger.info(`Found ${dustAppRunActions.length} Dust App Run actions`);

    // Step 2: Find the corresponding AgentMessages.
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: dustAppRunActions.map((action) => action.agentMessageId),
        },
        workspaceId: workspaceModelId,
      },
    });

    // Step 3: Find the corresponding AgentConfigurations.
    const agentConfigurationSIds = [
      ...new Set(agentMessages.map((message) => message.agentConfigurationId)),
    ];

    const agentConfigurations = await AgentConfiguration.findAll({
      where: {
        sId: {
          [Op.in]: agentConfigurationSIds,
        },
        workspaceId: workspaceModelId,
      },
      include: [
        {
          model: AgentMCPServerConfiguration,
          as: "mcpServerConfigurations",
        },
      ],
    });
    const agentConfigurationsMap = new Map(
      agentConfigurations.map((config) => [
        `${config.sId}-${config.version}`,
        config,
      ])
    );

    const agentMessagesMap = new Map(
      agentMessages.map((message) => [message.id, message])
    );

    // Step 4: Create the MCP actions with their output items.
    await concurrentExecutor(
      dustAppRunActions,
      async (dustAppRunAction) => {
        const agentMessage = agentMessagesMap.get(
          dustAppRunAction.agentMessageId
        );
        assert(agentMessage, "Agent message must exist");

        const agentConfiguration = agentConfigurationsMap.get(
          `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
        );

        await migrateSingleDustAppRunAction({
          auth,
          agentConfiguration: agentConfiguration ?? null,
          dustAppRunAction,
          mcpServerViewForDustAppRun,
          parentLogger,
          execute,
        });
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );

    // Step 5: Delete the legacy Dust App Run actions.
    if (execute) {
      await AgentDustAppRunAction.destroy({
        where: {
          id: {
            [Op.in]: dustAppRunActions.map((action) => action.id),
          },
          workspaceId: workspaceModelId,
        },
      });
    }

    hasMore = dustAppRunActions.length === BATCH_SIZE;
    lastId = dustAppRunActions[dustAppRunActions.length - 1].id;
  } while (hasMore);
}

/**
 * Migrates a single Dust App Run action from non-MCP to MCP version.
 */
async function migrateSingleDustAppRunAction({
  auth,
  agentConfiguration,
  dustAppRunAction,
  mcpServerViewForDustAppRun,
  parentLogger,
  execute,
}: {
  auth: Authenticator;
  agentConfiguration: AgentConfiguration | null;
  dustAppRunAction: AgentDustAppRunAction;
  execute: boolean;
  mcpServerViewForDustAppRun: MCPServerViewResource;
  parentLogger: Logger;
}) {
  // Find the MCP server configuration for Dust App Run.
  const dustAppRunMcpServerConfiguration =
    agentConfiguration?.mcpServerConfigurations.find(
      (config) =>
        config.mcpServerViewId === mcpServerViewForDustAppRun.id &&
        config.appId === dustAppRunAction.appId
    );

  const mcpServerConfigurationId =
    dustAppRunMcpServerConfiguration?.sId ??
    NOT_FOUND_MCP_SERVER_CONFIGURATION_ID;

  if (execute) {
    const mcpAction = await AgentMCPAction.create({
      workspaceId: dustAppRunAction.workspaceId,
      createdAt: dustAppRunAction.createdAt,
      updatedAt: dustAppRunAction.updatedAt,
      mcpServerConfigurationId,
      params: dustAppRunAction.params,
      functionCallId: dustAppRunAction.functionCallId,
      functionCallName: dustAppRunAction.functionCallName,
      step: dustAppRunAction.step,
      agentMessageId: dustAppRunAction.agentMessageId,
      isError: false,
      executionState: "allowed_implicitly",
    });

    // Create output items based on the presence of a file.
    const outputItems: CreationAttributes<AgentMCPActionOutputItem>[] = [];

    // If there's a file, create a file resource output item.
    if (dustAppRunAction.resultsFileId) {
      // Fetch the file to get its actual properties.
      const file = await FileResource.fetchByModelIdWithAuth(
        auth,
        dustAppRunAction.resultsFileId
      );

      if (file) {
        outputItems.push({
          workspaceId: dustAppRunAction.workspaceId,
          createdAt: dustAppRunAction.createdAt,
          updatedAt: dustAppRunAction.updatedAt,
          agentMCPActionId: mcpAction.id,
          content: {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
              uri: `file://${file.id}`,
              fileId: file.sId,
              title: file.fileName,
              contentType: file.contentType,
              snippet: dustAppRunAction.resultsFileSnippet,
              text: `Generated ${file.contentType === "text/csv" ? "CSV" : "text"} file: ${file.fileName}`,
            },
          },
          fileId: dustAppRunAction.resultsFileId,
        });
      } else {
        parentLogger.warn(
          {
            dustAppRunActionId: dustAppRunAction.id,
            resultsFileId: dustAppRunAction.resultsFileId,
          },
          "File not found for Dust App Run action"
        );
      }
    }

    // Always create a text output item with the JSON output.
    outputItems.push({
      workspaceId: dustAppRunAction.workspaceId,
      createdAt: dustAppRunAction.createdAt,
      updatedAt: dustAppRunAction.updatedAt,
      agentMCPActionId: mcpAction.id,
      content: {
        type: "text",
        text: JSON.stringify(dustAppRunAction.output, null, 2),
      },
      fileId: null,
    });

    await AgentMCPActionOutputItem.bulkCreate(outputItems);

    parentLogger.info(
      {
        dustAppRunActionId: dustAppRunAction.id,
        agentConfigurationId: agentConfiguration?.sId ?? "unknown",
        appId: dustAppRunAction.appId,
        mcpServerConfigurationId,
        mcpActionId: mcpAction.id,
        outputItemsCount: outputItems.length,
        hasFile: !!dustAppRunAction.resultsFileId,
      },
      "Successfully migrated Dust App Run action to MCP"
    );
  } else {
    parentLogger.info(
      {
        dustAppRunActionId: dustAppRunAction.id,
        mcpServerConfigurationId,
        agentConfigurationId: agentConfiguration?.sId ?? "unknown",
        appId: dustAppRunAction.appId,
      },
      "Would migrate Dust App Run action to MCP (dry run)"
    );
  }
}

/**
 * Script to migrate dust app run actions from non-MCP to MCP version.
 *
 */
makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace ID to migrate",
      required: false,
    },
  },
  async ({ execute, workspaceId }, parentLogger) => {
    let workspaceModelIds: ModelId[] = [];

    if (workspaceId) {
      const workspace = await getWorkspaceInfos(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }
      workspaceModelIds = [workspace.id];
    } else {
      const dustAppRunActions = await AgentDustAppRunAction.findAll({
        attributes: ["workspaceId"],
        group: ["workspaceId"],
        raw: true,
      });
      workspaceModelIds = dustAppRunActions.map((action) => action.workspaceId);
    }

    for (const workspaceModelId of workspaceModelIds) {
      await migrateWorkspaceDustAppRunActions({
        execute,
        workspaceModelId,
        parentLogger,
      });
    }
  }
);
