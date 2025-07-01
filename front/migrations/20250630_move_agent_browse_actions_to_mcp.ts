import type { BrowseResultResourceType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES, removeNulls } from "@dust-tt/client";
import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import type { ActionBaseParams } from "@app/lib/actions/mcp";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { AgentBrowseAction } from "@app/lib/models/assistant/actions/browse";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
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

function agentBrowseActionToAgentMCPAction(
  browseAction: AgentBrowseAction,
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
      browseActionId: browseAction.id,
      mcpServerConfigurationId,
    },
    "Converted browse action to MCP action"
  );

  return {
    action: {
      agentMessageId: browseAction.agentMessageId,
      functionCallId: browseAction.functionCallId,
      functionCallName: browseAction.functionCallName,
      createdAt: browseAction.createdAt,
      updatedAt: browseAction.updatedAt,
      generatedFiles: [],
      mcpServerConfigurationId,
      params: {
        urls: browseAction.urls,
      },
      step: browseAction.step,
      workspaceId: browseAction.workspaceId,
      // We did not save the error in the legacy browse action.
      isError: false,
      executionState: "allowed_implicitly",
    },
  };
}

function urlToBrowseResultResourceTypes(
  browseAction: AgentBrowseAction,
  { url }: { url: string }
): BrowseResultResourceType[] | null {
  const { output } = browseAction;

  // Step 1: Find all outputs items for the given URL.
  const outputItems =
    output?.results.filter((item) => item.requestedUrl === url) ?? [];

  // Step 2: If no output items are found, return early.
  if (outputItems.length === 0) {
    return null;
  }

  // Step 3: Loop over the output items and build the browse result resource.
  const results = outputItems.map((item) => {
    return {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.BROWSE_RESULT,
      errorMessage: item.errorMessage,
      requestedUrl: item.requestedUrl,
      responseCode: item.responseCode,
      text: item.content,
      uri: item.requestedUrl,
    };
  });

  return results;
}

function createOutputItem(
  resource: BrowseResultResourceType,
  mcpActionId: ModelId,
  browseAction: AgentBrowseAction
): CreationAttributes<AgentMCPActionOutputItem> {
  return {
    agentMCPActionId: mcpActionId,
    content: {
      type: "resource",
      resource,
    },
    createdAt: browseAction.createdAt,
    updatedAt: browseAction.updatedAt,
    workspaceId: browseAction.workspaceId,
  };
}

async function migrateSingleBrowseAction(
  browseAction: AgentBrowseAction,
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
  // Step 1: Convert the legacy browse action to an MCP action.
  const mcpAction = agentBrowseActionToAgentMCPAction(
    browseAction,
    agentConfiguration ?? null,
    {
      mcpServerViewForWebsearchAndBrowseId,
    },
    logger
  );

  // Step 2: Create one resource for each URL/item.
  const browseResultResources = removeNulls(
    browseAction.urls.flatMap((url) =>
      urlToBrowseResultResourceTypes(browseAction, { url })
    )
  );

  logger.info(
    {
      browseActionId: browseAction.id,
      browseResultResources: browseResultResources.length,
    },
    "Found browse result resources"
  );

  if (execute) {
    // Step 3: Create the MCP action.
    const mcpActionCreated = await AgentMCPAction.create(mcpAction.action);

    if (browseResultResources.length > 0) {
      // Step 4: Create the MCP action output items.
      await AgentMCPActionOutputItem.bulkCreate([
        // Create the browse result resources.
        ...browseResultResources.map((resource) =>
          createOutputItem(resource, mcpActionCreated.id, browseAction)
        ),
      ]);
    }
  }
}

async function migrateWorkspaceAgentBrowseActions(
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
    // Step 1: Retrieve the legacy browse actions.
    const browseActions = await AgentBrowseAction.findAll({
      where: {
        workspaceId: workspace.id,
      },
      limit: BATCH_SIZE,
    });

    if (browseActions.length === 0) {
      return;
    }

    logger.info(`Found ${browseActions.length} browse actions`);

    // Step 2: Find the corresponding AgentMessages.
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: browseActions.map((action) => action.agentMessageId),
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
      browseActions,
      async (browseAction) => {
        const agentMessage = agentMessagesMap.get(browseAction.agentMessageId);
        assert(agentMessage, "Agent message must exist");

        const agentConfiguration = agentConfigurationsMap.get(
          `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
        );
        assert(
          agentConfiguration ||
            isGlobalAgentId(agentMessage.agentConfigurationId) ||
            // Dust Next is a global agent that was removed from everywhere.
            agentMessage.agentConfigurationId === "dust-next",
          `Agent configuration must exist for agent ${agentMessage.agentConfigurationId}`
        );

        await migrateSingleBrowseAction(
          browseAction,
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

    // Step 5: Delete the legacy browse actions.
    if (execute) {
      await AgentBrowseAction.destroy({
        where: {
          id: {
            [Op.in]: browseActions.map((action) => action.id),
          },
          workspaceId: workspace.id,
        },
      });
    }

    hasMore = browseActions.length === BATCH_SIZE;
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

      await migrateWorkspaceAgentBrowseActions(workspace, logger, { execute });
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          migrateWorkspaceAgentBrowseActions(
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
