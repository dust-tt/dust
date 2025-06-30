import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import {
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_TABLES_QUERY_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ActionBaseParams } from "@app/lib/actions/mcp";
import type {
  ExecuteTablesQueryErrorResourceType,
  SqlQueryOutputType,
  ThinkingOutputType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType, ModelId } from "@app/types";
import { isGlobalAgentId } from "@app/types";

const WORKSPACE_CONCURRENCY = 50;
const BATCH_SIZE = 200;
const CREATION_CONCURRENCY = 50;

const NOT_FOUND_MCP_SERVER_CONFIGURATION_ID = "unknown";

// Types for the resources that are output by the tools of this server.
type TablesQueryOutputResource =
  | ExecuteTablesQueryErrorResourceType
  | SqlQueryOutputType
  | ThinkingOutputType
  | ToolGeneratedFileType;

function isRecordOfStrings(params: unknown): params is Record<string, unknown> {
  return (
    !!params &&
    typeof params === "object" &&
    Object.values(params).every((v) => typeof v === "string")
  );
}

function agentTablesQueryActionToAgentMCPAction(
  tablesQueryAction: AgentTablesQueryAction,
  agentConfiguration: AgentConfiguration | null,
  mcpServerViewForTablesQueryId: ModelId,
  logger: Logger
): {
  action: ActionBaseParams & CreationAttributes<AgentMCPAction>;
} {
  logger.info(
    { mcpServerViewForTablesQueryId },
    "Found MCP server view ID for Tables Query"
  );

  // Find the MCP server configuration for Tables Query.
  const tablesQueryMcpServerConfiguration =
    agentConfiguration?.mcpServerConfigurations.find(
      (config) => config.mcpServerViewId === mcpServerViewForTablesQueryId
    );

  const isJITServerAction =
    tablesQueryAction.functionCallName ===
    DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME;

  // Determine the MCP server configuration ID to use.
  let mcpServerConfigurationId: string;

  if (isJITServerAction) {
    // For JIT server actions, use the hardcoded -1 ID like in the MCP server implementation.
    mcpServerConfigurationId = "-1";
  } else {
    // For custom agent configurations, use the TablesQuery configuration.
    mcpServerConfigurationId =
      tablesQueryMcpServerConfiguration?.sId ??
      NOT_FOUND_MCP_SERVER_CONFIGURATION_ID;
  }

  logger.info(
    {
      tablesQueryActionId: tablesQueryAction.id,
      mcpServerConfigurationId,
    },
    "Converted Tables Query action to MCP action"
  );

  return {
    action: {
      agentMessageId: tablesQueryAction.agentMessageId,
      functionCallId: tablesQueryAction.functionCallId,
      functionCallName: tablesQueryAction.functionCallName,
      createdAt: tablesQueryAction.createdAt,
      updatedAt: tablesQueryAction.updatedAt,
      generatedFiles: [],
      mcpServerConfigurationId,
      params: isRecordOfStrings(tablesQueryAction.params)
        ? tablesQueryAction.params
        : {},
      step: tablesQueryAction.step,
      workspaceId: tablesQueryAction.workspaceId,
      isError: false,
      executionState: "allowed_implicitly",
    },
  };
}

function createOutputItem({
  resource,
  agentMCPAction,
  tablesQueryAction,
}: {
  resource: TablesQueryOutputResource;
  agentMCPAction: AgentMCPAction;
  tablesQueryAction: AgentTablesQueryAction;
}): CreationAttributes<AgentMCPActionOutputItem> {
  return {
    agentMCPActionId: agentMCPAction.id,
    content: {
      type: "resource",
      resource,
    },
    createdAt: tablesQueryAction.createdAt,
    updatedAt: tablesQueryAction.updatedAt,
    workspaceId: tablesQueryAction.workspaceId,
  };
}

async function migrateSingleTablesQueryAction(
  auth: Authenticator,
  tablesQueryAction: AgentTablesQueryAction,
  agentConfiguration: AgentConfiguration | null,
  logger: Logger,
  {
    execute,
    mcpServerViewForTablesQueryId,
  }: {
    execute: boolean;
    mcpServerViewForTablesQueryId: ModelId;
  }
) {
  // Step 1: Convert the legacy Tables Query action to an MCP action
  const mcpAction = agentTablesQueryActionToAgentMCPAction(
    tablesQueryAction,
    agentConfiguration ?? null,
    mcpServerViewForTablesQueryId,
    logger
  );

  // Step 2: Prepare output items from the Tables Query action
  if (execute) {
    // Step 3: Create the MCP action
    const mcpActionCreated = await AgentMCPAction.create(mcpAction.action);

    // Step 4: Create output items for the action results
    const { output } = tablesQueryAction;

    const resources: TablesQueryOutputResource[] = [];

    if (
      !output ||
      typeof output !== "object" ||
      Object.keys(output).length === 0
    ) {
      return;
    }

    if ("thinking" in output && typeof output?.thinking === "string") {
      resources.push({
        text: output.thinking,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.THINKING,
        uri: "",
      });
    }

    if ("query" in output && typeof output?.query === "string") {
      resources.push({
        text: output.query,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.SQL_QUERY,
        uri: "",
      });
    }

    if ("error" in output && typeof output?.error === "string") {
      resources.push({
        text: output.error as string,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXECUTE_TABLES_QUERY_ERROR,
        uri: "",
      });
    }

    if (tablesQueryAction.resultsFileId) {
      const resultsFile = await FileResource.fetchByModelIdWithAuth(
        auth,
        tablesQueryAction.resultsFileId
      );
      if (resultsFile) {
        resources.push({
          text: `Your query results were generated successfully.`,
          uri: resultsFile.getPublicUrl(auth),
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          fileId: resultsFile.sId,
          title: resultsFile.fileName,
          contentType: resultsFile.contentType,
          snippet: resultsFile.snippet,
        });
      }
    }

    if (tablesQueryAction.sectionFileId) {
      const sectionFile = await FileResource.fetchByModelIdWithAuth(
        auth,
        tablesQueryAction.sectionFileId
      );
      if (sectionFile) {
        resources.push({
          text: "Your query results were generated successfully.",
          uri: sectionFile.getPublicUrl(auth),
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          fileId: sectionFile.sId,
          title: sectionFile.fileName,
          contentType: sectionFile.contentType,
          snippet: null,
        });
      }
    }

    // Step 5: Create all output items
    await AgentMCPActionOutputItem.bulkCreate(
      resources.map((resource) =>
        createOutputItem({
          resource,
          agentMCPAction: mcpActionCreated,
          tablesQueryAction,
        })
      )
    );

    logger.info(
      {
        tablesQueryActionId: tablesQueryAction.id,
        mcpActionId: mcpActionCreated.id,
        outputItemsCount: resources.length,
      },
      "Successfully migrated Tables Query action to MCP"
    );
  }
}

async function migrateWorkspaceTablesQueryActions(
  workspace: LightWorkspaceType,
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const mcpServerViewForTablesQuery =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "query_tables"
    );

  assert(
    mcpServerViewForTablesQuery,
    "Tables Query MCP server view must exist"
  );

  let hasMore = false;
  do {
    // Step 1: Retrieve the legacy Tables Query actions
    const tablesQueryActions = await AgentTablesQueryAction.findAll({
      where: {
        workspaceId: workspace.id,
      },
      limit: BATCH_SIZE,
      include: [
        {
          model: FileModel,
          as: "resultsFile",
          required: false,
        },
        {
          model: FileModel,
          as: "sectionFile",
          required: false,
        },
      ],
    });

    if (tablesQueryActions.length === 0) {
      return;
    }

    logger.info(`Found ${tablesQueryActions.length} Tables Query actions`);

    // Step 2: Find the corresponding AgentMessages
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: tablesQueryActions.map((action) => action.agentMessageId),
        },
        workspaceId: workspace.id,
      },
    });

    // Step 3: Find the corresponding AgentConfigurations
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

    // Step 4: Create the MCP actions with their output items
    await concurrentExecutor(
      tablesQueryActions,
      async (tablesQueryAction) => {
        const agentMessage = agentMessagesMap.get(
          tablesQueryAction.agentMessageId
        );
        assert(agentMessage, "Agent message must exist");

        const agentConfiguration = agentConfigurationsMap.get(
          `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
        );
        assert(
          agentConfiguration ||
            isGlobalAgentId(agentMessage.agentConfigurationId),
          `Agent configuration must exist for agent ${agentMessage.agentConfigurationId}`
        );

        await migrateSingleTablesQueryAction(
          auth,
          tablesQueryAction,
          agentConfiguration ?? null,
          logger,
          {
            execute,
            mcpServerViewForTablesQueryId: mcpServerViewForTablesQuery.id,
          }
        );
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );

    // Step 5: Delete the legacy Tables Query actions
    if (execute) {
      await AgentTablesQueryAction.destroy({
        where: {
          id: {
            [Op.in]: tablesQueryActions.map((action) => action.id),
          },
          workspaceId: workspace.id,
        },
      });
    }

    hasMore = tablesQueryActions.length === BATCH_SIZE;
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

      await migrateWorkspaceTablesQueryActions(workspace, logger, { execute });
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          migrateWorkspaceTablesQueryActions(
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
