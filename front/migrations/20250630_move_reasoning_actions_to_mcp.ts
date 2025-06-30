import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import {
  AgentReasoningAction,
  AgentReasoningConfiguration,
} from "@app/lib/models/assistant/actions/reasoning";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType, ModelId } from "@app/types";

const WORKSPACE_CONCURRENCY = 50;
const BATCH_SIZE = 200;
const CREATION_CONCURRENCY = 50;

/**
 * Loop through all reasoning actions and migrate them to MCP.
 */
async function migrateWorkspaceReasoningActions(
  workspace: LightWorkspaceType,
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Get the MCP server view for reasoning.
  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  const mcpServerViewForReasoning =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "reasoning"
    );
  assert(mcpServerViewForReasoning, "Reasoning MCP server view must exist");

  const hasMore = false;
  do {
    // Step 1: Retrieve the legacy reasoning actions.
    const reasoningActions = await AgentReasoningAction.findAll({
      where: {
        workspaceId: workspace.id,
      },
      limit: BATCH_SIZE,
    });

    if (reasoningActions.length === 0) {
      return;
    }

    logger.info(`Found ${reasoningActions.length} reasoning actions`);

    // Step 2: Find the corresponding AgentMessages.
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: reasoningActions.map((action) => action.agentMessageId),
        },
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
      },
    });

    // Step 4: Create the MCP actions with their output items.
    await concurrentExecutor(
      reasoningActions,
      async (reasoningAction) => {
        const agentMessage = agentMessages.find(
          (message) => message.id === reasoningAction.agentMessageId
        );
        assert(agentMessage, "Agent message must exist");

        const agentConfiguration = agentConfigurations.find(
          (config) => config.sId === agentMessage.agentConfigurationId
        );
        assert(agentConfiguration, "Agent configuration must exist");

        await migrateSingleReasoningAction({
          agentConfiguration,
          reasoningAction,
          mcpServerViewForReasoning: mcpServerViewForReasoning.id,
          logger,
          execute,
        });
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );
  } while (hasMore);
}

/**
 * Migrate a single reasoning action to MCP.
 */
async function migrateSingleReasoningAction({
  reasoningAction,
  agentConfiguration,
  mcpServerViewForReasoning,
  logger,
  execute,
}: {
  reasoningAction: AgentReasoningAction;
  agentConfiguration: AgentConfiguration;
  mcpServerViewForReasoning: ModelId;
  logger: Logger;
  execute: boolean;
}) {
  if (!execute) {
    logger.info(
      { reasoningActionId: reasoningAction.id },
      "Would migrate reasoning action, but execute is false."
    );
    return;
  }

  // Find the action's reasoning configuration.
  const reasoningConfiguration = await AgentReasoningConfiguration.findOne({
    where: {
      sId: reasoningAction.reasoningConfigurationId,
    },
  });
  assert(reasoningConfiguration, "Reasoning configuration must exist");

  // Create the MCP server configuration if it does not exist and save it in the reasoning configuration.
  let reasoningMcpServerConfiguration: AgentMCPServerConfiguration | null =
    null;
  if (reasoningConfiguration.mcpServerConfigurationId) {
    reasoningMcpServerConfiguration =
      await AgentMCPServerConfiguration.findByPk(
        reasoningConfiguration.mcpServerConfigurationId
      );
    assert(
      reasoningMcpServerConfiguration,
      "Reasoning MCP server configuration must exist"
    );
  } else {
    reasoningMcpServerConfiguration = await AgentMCPServerConfiguration.create({
      sId: reasoningConfiguration.sId,
      additionalConfiguration: {},
      agentConfigurationId: agentConfiguration.id,
      mcpServerViewId: mcpServerViewForReasoning,
      workspaceId: reasoningAction.workspaceId,
    });
    await reasoningConfiguration.update({
      mcpServerConfigurationId: reasoningMcpServerConfiguration.id,
    });
  }

  // Convert the legacy reasoning action to an MCP action.
  const mcpActionParams: CreationAttributes<AgentMCPAction> = {
    workspaceId: reasoningAction.workspaceId,
    agentMessageId: reasoningAction.agentMessageId,
    mcpServerConfigurationId: reasoningMcpServerConfiguration.sId,
    params: {},
    functionCallId: reasoningAction.functionCallId,
    functionCallName: reasoningAction.functionCallName,
    step: reasoningAction.step,
    executionState: "allowed_implicitly",
    isError: false,
  };

  const mcpAction = await AgentMCPAction.create(mcpActionParams);

  // Create the output items.
  await AgentMCPActionOutputItem.create({
    agentMCPActionId: mcpAction.id,
    content: {
      type: "resource",
      resource: {
        text: reasoningAction.thinking ?? "",
        uri: "",
        mimeType: "application/vnd.dust.tool-output.thinking",
      },
    },
    createdAt: reasoningAction.createdAt,
    updatedAt: reasoningAction.updatedAt,
    workspaceId: reasoningAction.workspaceId,
  });
  await AgentMCPActionOutputItem.create({
    agentMCPActionId: mcpAction.id,
    content: {
      type: "resource",
      resource: {
        text: reasoningAction.output ?? "",
        uri: "",
        mimeType: "application/vnd.dust.tool-output.reasoning-success",
      },
    },
    createdAt: reasoningAction.createdAt,
    updatedAt: reasoningAction.updatedAt,
    workspaceId: reasoningAction.workspaceId,
  });

  // Delete the legacy reasoning action.
  await reasoningAction.destroy();
}

/**
 * Migrates reasoning actions to MCP.
 *
 * @param workspaceId - The ID of the workspace to migrate. If not provided, all workspaces will be migrated.
 * @param execute - Whether to execute the migration.
 * @param logger - The logger to use.
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
    const logger = parentLogger.child({ workspaceId });

    if (workspaceId) {
      const workspace = await getWorkspaceInfos(workspaceId);

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      await migrateWorkspaceReasoningActions(workspace, logger, { execute });
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          migrateWorkspaceReasoningActions(
            workspace,
            logger.child({ workspaceId: workspace.sId }),
            {
              execute,
            }
          ),
        {
          concurrency: WORKSPACE_CONCURRENCY,
        }
      );
    }
  }
);
