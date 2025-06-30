import type {
  WebsearchQueryResourceType,
  WebsearchResultResourceType,
} from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import type { ActionBaseParams } from "@app/lib/actions/mcp";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentWebsearchAction } from "@app/lib/models/assistant/actions/websearch";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType, ModelId } from "@app/types";
import { isGlobalAgentId } from "@app/types";

const WORKSPACE_CONCURRENCY = 50;
const BATCH_SIZE = 200;
const CREATION_CONCURRENCY = 50;

const NOT_FOUND_MCP_SERVER_CONFIGURATION_ID = "unknown";

function isWebsearchActionError(
  websearchAction: AgentWebsearchAction
): boolean {
  const { output } = websearchAction;

  if (!output) {
    return false;
  }

  return "error" in output;
}

function agentWebsearchActionToAgentMCPAction(
  websearchAction: AgentWebsearchAction,
  agentConfiguration: AgentConfiguration | null,
  {
    mcpServerViewForWebsearchAndBrowseId,
  }: {
    mcpServerViewForWebsearchAndBrowseId: ModelId;
  },
  logger: Logger
): {
  action: ActionBaseParams & CreationAttributes<AgentMCPAction>;
} {
  logger.info(
    {
      mcpServerViewForWebsearchAndBrowseId,
    },
    "Found MCP server view IDs"
  );

  // The `mcpServerConfigurationId` was not properly backfilled when AgentBrowseConfiguration
  // was migrated to MCP, preventing any possibility to convert the legacy browse actions
  // to MCP "working/replayable" actions. This is best effort, we take the first agent_data_source
  // as the MCP server configuration if available.
  const browseAndWebsearchMcpServerConfiguration =
    agentConfiguration?.mcpServerConfigurations.find(
      (config) =>
        config.mcpServerViewId === mcpServerViewForWebsearchAndBrowseId
    );

  // Determine the MCP server configuration ID to use.
  const mcpServerConfigurationId =
    browseAndWebsearchMcpServerConfiguration?.sId ??
    NOT_FOUND_MCP_SERVER_CONFIGURATION_ID;

  logger.info(
    {
      websearchActionId: websearchAction.id,
      mcpServerConfigurationId,
    },
    "Converted websearch action to MCP action"
  );

  return {
    action: {
      agentMessageId: websearchAction.agentMessageId,
      functionCallId: websearchAction.functionCallId,
      functionCallName: websearchAction.functionCallName,
      createdAt: websearchAction.createdAt,
      updatedAt: websearchAction.updatedAt,
      generatedFiles: [],
      mcpServerConfigurationId,
      params: {
        query: websearchAction.query,
      },
      step: websearchAction.step,
      workspaceId: websearchAction.workspaceId,
      isError: isWebsearchActionError(websearchAction),
      executionState: "allowed_implicitly",
    },
  };
}

function queryToWebsearchQueryResourceType(
  websearchAction: AgentWebsearchAction
): WebsearchQueryResourceType {
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_QUERY,
    text: websearchAction.query,
    uri: "",
  };
}

function resultsToWebsearchResultResourceTypes(
  websearchAction: AgentWebsearchAction
): WebsearchResultResourceType[] | null {
  const { output } = websearchAction;

  if (!output) {
    return null;
  }

  const results = output.results.map((result) => {
    return {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
      reference: result.reference,
      text: result.snippet,
      title: result.title,
      uri: result.link,
    };
  });

  return results;
}

function createOutputItem(
  resource: WebsearchQueryResourceType | WebsearchResultResourceType,
  mcpActionId: ModelId,
  websearchAction: AgentWebsearchAction
): CreationAttributes<AgentMCPActionOutputItem> {
  return {
    agentMCPActionId: mcpActionId,
    content: {
      type: "resource",
      resource,
    },
    createdAt: websearchAction.createdAt,
    updatedAt: websearchAction.updatedAt,
    workspaceId: websearchAction.workspaceId,
  };
}

async function migrateSingleWebsearchAction(
  websearchAction: AgentWebsearchAction,
  agentConfiguration: AgentConfiguration | null,
  logger: Logger,
  {
    execute,
    mcpServerViewForWebsearchAndBrowseId,
  }: {
    execute: boolean;
    mcpServerViewForWebsearchAndBrowseId: ModelId;
  }
) {
  // Step 1: Convert the legacy websearch action to an MCP action.
  const mcpAction = agentWebsearchActionToAgentMCPAction(
    websearchAction,
    agentConfiguration ?? null,
    {
      mcpServerViewForWebsearchAndBrowseId,
    },
    logger
  );

  // Step 2: For each action push a query.
  const queryResource = queryToWebsearchQueryResourceType(websearchAction);

  // Step 3: For each result push a result.
  const websearchResultsResources =
    resultsToWebsearchResultResourceTypes(websearchAction);

  logger.info(
    {
      websearchActionId: websearchAction.id,
      websearchResultsResourcesLength: Array.isArray(websearchResultsResources)
        ? websearchResultsResources.length
        : 0,
    },
    "Found websearch results"
  );

  if (execute) {
    // Step 3: Create the MCP action.
    const mcpActionCreated = await AgentMCPAction.create(mcpAction.action);

    // Step 4: Create the MCP action output items.
    if (Array.isArray(websearchResultsResources)) {
      // Step 4: Create the MCP action output items.
      await AgentMCPActionOutputItem.bulkCreate([
        // Create the websearch query resource.
        createOutputItem(queryResource, mcpActionCreated.id, websearchAction),
        // Create the websearch result resources.
        ...websearchResultsResources.map((resource) =>
          createOutputItem(resource, mcpActionCreated.id, websearchAction)
        ),
      ]);
    }
  }
}

async function migrateWorkspaceAgentWebsearchActions(
  workspace: LightWorkspaceType,
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const mcpServerViewForWebsearchAdnBrowse =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "web_search_&_browse"
    );

  assert(
    mcpServerViewForWebsearchAdnBrowse,
    "Websearch and browse MCP server view must exist"
  );

  let hasMore = false;
  do {
    // Step 1: Retrieve the legacy websearch actions.
    const websearchActions = await AgentWebsearchAction.findAll({
      where: {
        workspaceId: workspace.id,
      },
      limit: BATCH_SIZE,
    });

    if (websearchActions.length === 0) {
      return;
    }

    logger.info(`Found ${websearchActions.length} websearch actions`);

    // Step 2: Find the corresponding AgentMessages.
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: websearchActions.map((action) => action.agentMessageId),
        },
        workspaceId: workspace.id,
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
        workspaceId: workspace.id,
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
      websearchActions,
      async (websearchAction) => {
        const agentMessage = agentMessagesMap.get(
          websearchAction.agentMessageId
        );
        assert(agentMessage, "Agent message must exist");

        const agentConfiguration = agentConfigurationsMap.get(
          `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
        );
        assert(
          agentConfiguration ||
            isGlobalAgentId(agentMessage.agentConfigurationId) ||
            // Dust Next and deepseekc are global agents that were removed from everywhere.
            ["dust-next", "deepseek"].includes(
              agentMessage.agentConfigurationId
            ),
          `Agent configuration must exist for agent ${agentMessage.agentConfigurationId}`
        );

        await migrateSingleWebsearchAction(
          websearchAction,
          agentConfiguration ?? null,
          logger,
          {
            execute,
            mcpServerViewForWebsearchAndBrowseId:
              mcpServerViewForWebsearchAdnBrowse.id,
          }
        );
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );

    // Step 5: Delete the legacy websearch actions.
    if (execute) {
      await AgentWebsearchAction.destroy({
        where: {
          id: {
            [Op.in]: websearchActions.map((action) => action.id),
          },
          workspaceId: workspace.id,
        },
      });
    }

    hasMore = websearchActions.length === BATCH_SIZE;
  } while (hasMore);
}

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

      await migrateWorkspaceAgentWebsearchActions(workspace, logger, {
        execute,
      });
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          migrateWorkspaceAgentWebsearchActions(
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
