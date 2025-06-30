import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentReasoningAction } from "@app/lib/models/assistant/actions/reasoning";
import { AgentReasoningConfiguration } from "@app/lib/models/assistant/actions/reasoning";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

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
    // Step 1: Retrieve the legacy reasoning configurations.
    const reasoningConfigurations = await AgentReasoningConfiguration.findAll({
      where: {
        workspaceId: workspace.id,
        mcpServerConfigurationId: null, // The one not migrated to MCP.
      },
      limit: BATCH_SIZE,
    });

    logger.info(
      `Found ${reasoningConfigurations.length} legacy reasoning configurations.`
    );

    if (reasoningConfigurations.length === 0) {
      return;
    }

    // Step 2: Create the MCP actions with their output items.
    await concurrentExecutor(
      reasoningConfigurations,
      async (reasoningConfiguration) => {
        await migrateReasoningActionsForActionConfiguration({
          reasoningConfiguration,
          mcpServerViewForReasoning: mcpServerViewForReasoning,
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
 * Migrate the actions for a single reasoning configuration.
 */
async function migrateReasoningActionsForActionConfiguration({
  reasoningConfiguration,
  mcpServerViewForReasoning,
  logger,
  execute,
}: {
  reasoningConfiguration: AgentReasoningConfiguration;
  mcpServerViewForReasoning: MCPServerViewResource;
  logger: Logger;
  execute: boolean;
}) {
  // The reasoning configuration must have an agent configuration when it was not migrated to MCP.
  assert(
    reasoningConfiguration.agentConfigurationId,
    "Reasoning configuration must have an agent configuration."
  );

  // Find the agent configuration.
  const agentConfiguration = await AgentConfiguration.findByPk(
    reasoningConfiguration.agentConfigurationId
  );
  assert(agentConfiguration, "Agent configuration must exist");

  if (execute) {
    // Create the MCP server configuration.
    const reasoningMcpServerConfiguration =
      await AgentMCPServerConfiguration.create({
        sId: generateRandomModelSId(),
        additionalConfiguration: {},
        agentConfigurationId: agentConfiguration.id,
        mcpServerViewId: mcpServerViewForReasoning.id,
        workspaceId: reasoningConfiguration.workspaceId,
        internalMCPServerId: mcpServerViewForReasoning.mcpServerId,
        name: reasoningConfiguration.name,
        singleToolDescriptionOverride: reasoningConfiguration.description,
        appId: null,
        jsonSchema: null,
        timeFrame: null,
      });

    const reasonningActions = await AgentReasoningAction.findAll({
      where: {
        reasoningConfigurationId: reasoningConfiguration.id,
      },
    });

    if (reasonningActions.length === 0) {
      logger.info(
        { reasoningConfigurationId: reasoningConfiguration.id },
        "No reasoning actions found for this configuration."
      );
      return;
    }

    // Create the MCP actions.
    await concurrentExecutor(
      reasonningActions,
      async (reasoningAction) => {
        await createMCPActionAndOutputItems({
          reasoningMcpServerConfiguration,
          reasoningAction,
          logger,
          execute,
        });
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );

    // Update the reasoning configuration to point to the MCP server configuration.
    await reasoningConfiguration.update({
      mcpServerConfigurationId: reasoningMcpServerConfiguration.id,
      agentConfigurationId: null,
    });

    // Delete the legacy reasoning actions.
    await AgentReasoningAction.destroy({
      where: {
        reasoningConfigurationId: reasoningConfiguration.id,
        workspaceId: reasoningConfiguration.workspaceId,
      },
    });
  }
}

/**
 * Create the MCP action and the output items for a single reasoning action.
 */
async function createMCPActionAndOutputItems({
  reasoningMcpServerConfiguration,
  reasoningAction,
  logger,
  execute,
}: {
  reasoningMcpServerConfiguration: AgentMCPServerConfiguration;
  reasoningAction: AgentReasoningAction;
  logger: Logger;
  execute: boolean;
}) {
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

  const outputItemThinking: AgentMCPActionOutputItem["content"] = {
    type: "resource",
    resource: {
      text: reasoningAction.thinking ?? "",
      uri: "",
      mimeType: "application/vnd.dust.tool-output.thinking",
    },
  };

  const outputItemContent: AgentMCPActionOutputItem["content"] = {
    type: "resource",
    resource: {
      text: reasoningAction.output ?? "",
      uri: "",
      mimeType: "application/vnd.dust.tool-output.reasoning-success",
    },
  };

  if (execute) {
    // Create the MCP action.
    const mcpAction = await AgentMCPAction.create(mcpActionParams);
    // Create both output items concurrently.
    await Promise.all([
      AgentMCPActionOutputItem.create({
        agentMCPActionId: mcpAction.id,
        content: outputItemThinking,
        createdAt: reasoningAction.createdAt,
        updatedAt: reasoningAction.updatedAt,
        workspaceId: reasoningAction.workspaceId,
      }),
      AgentMCPActionOutputItem.create({
        agentMCPActionId: mcpAction.id,
        content: outputItemContent,
        createdAt: reasoningAction.createdAt,
        updatedAt: reasoningAction.updatedAt,
        workspaceId: reasoningAction.workspaceId,
      }),
    ]);
  } else {
    logger.info(
      {
        reasoningActionId: reasoningAction.id,
        mcpActionParams,
        outputItemThinking,
        outputItemContent,
      },
      "Would migrate reasoning action, but execute is false."
    );
  }
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
