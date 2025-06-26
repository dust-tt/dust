import type { SearchQueryResourceType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Logger } from "pino";
import type { CreationAttributes } from "sequelize";
import { Op } from "sequelize";

import {
  DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ActionBaseParams } from "@app/lib/actions/mcp";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeQueryResource } from "@app/lib/actions/mcp_internal_actions/servers/search/utils";
import config from "@app/lib/api/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDocument } from "@app/lib/data_sources";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
  AgentMCPServerConfiguration,
} from "@app/lib/models/assistant/actions/mcp";
import { AgentRetrievalAction } from "@app/lib/models/assistant/actions/retrieval";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RetrievalDocumentResource } from "@app/lib/resources/retrieval_document_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType, ModelId, TimeFrame } from "@app/types";
import { GLOBAL_AGENTS_SID, isGlobalAgentId, stripNullBytes } from "@app/types";

const WORKSPACE_CONCURRENCY = 50;
const BATCH_SIZE = 200;
const CREATION_CONCURRENCY = 50;

const NOT_FOUND_MCP_SERVER_CONFIGURATION_ID = "unknown";

function getTimeFrameUnit(
  retrievalAction: AgentRetrievalAction
): TimeFrame | null {
  if (
    retrievalAction.relativeTimeFrameUnit &&
    retrievalAction.relativeTimeFrameDuration
  ) {
    return {
      duration: retrievalAction.relativeTimeFrameDuration,
      unit: retrievalAction.relativeTimeFrameUnit,
    };
  }

  return null;
}

function agentRetrievalActionToAgentMCPAction(
  retrievalAction: AgentRetrievalAction,
  agentConfiguration: AgentConfiguration | null,
  {
    mcpServerViewForSearchId,
    mcpServerViewForIncludeDataId,
  }: {
    mcpServerViewForSearchId: ModelId;
    mcpServerViewForIncludeDataId: ModelId;
  },
  logger: Logger
): {
  action: ActionBaseParams & CreationAttributes<AgentMCPAction>;
} {
  logger.info(
    {
      mcpServerViewForSearchId,
      mcpServerViewForIncludeDataId,
    },
    "Found MCP server view IDs"
  );

  // The `mcpServerConfigurationId` was not properly backfilled when AgentRetrievalConfiguration
  // was migrated to MCP, preventing any possibility to convert the legacy retrieval actions
  // to MCP "working/replayable" actions. This is best effort, we take the first agent_data_source
  // as the MCP server configuration if available.
  const searchMcpServerConfiguration =
    agentConfiguration?.mcpServerConfigurations.find(
      (config) => config.mcpServerViewId === mcpServerViewForSearchId
    );

  const includeDataMcpServerConfiguration =
    agentConfiguration?.mcpServerConfigurations.find(
      (config) => config.mcpServerViewId === mcpServerViewForIncludeDataId
    );

  const isJITServerAction = [
    DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
    DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
  ].includes(retrievalAction.functionCallName ?? "");

  // Determine the MCP server configuration ID to use.
  let mcpServerConfigurationId: string;

  if (isJITServerAction) {
    // For JIT server actions (default search/include), use the hardcoded -1 ID like in the MCP
    // server implementation.
    mcpServerConfigurationId = "-1";
  } else {
    // For custom agent configurations, prefer search configuration over include_data configuration.
    mcpServerConfigurationId =
      searchMcpServerConfiguration?.sId ??
      includeDataMcpServerConfiguration?.sId ??
      NOT_FOUND_MCP_SERVER_CONFIGURATION_ID;
  }

  logger.info(
    {
      retrievalActionId: retrievalAction.id,
      mcpServerConfigurationId,
    },
    "Converted retrieval action to MCP action"
  );

  const timeFrame = getTimeFrameUnit(retrievalAction);

  return {
    action: {
      agentMessageId: retrievalAction.agentMessageId,
      functionCallId: retrievalAction.functionCallId,
      functionCallName: retrievalAction.functionCallName,
      createdAt: retrievalAction.createdAt,
      updatedAt: retrievalAction.updatedAt,
      generatedFiles: [],
      mcpServerConfigurationId,
      params: {
        query: retrievalAction.query,
        tagsIn: retrievalAction.tagsIn,
        tagsNot: retrievalAction.tagsNot,
        relativeTimeFrame: timeFrame
          ? `${timeFrame.duration}${timeFrame.unit}`
          : "all",
      },
      step: retrievalAction.step,
      workspaceId: retrievalAction.workspaceId,
      // We did not save the error in the legacy retrieval action.
      isError: false,
      executionState: "allowed_implicitly",
    },
  };
}

function documentRetrievalToSearchResultResourceType(
  retrievalDocument: RetrievalDocumentResource
): SearchResultResourceType {
  return {
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.DATA_SOURCE_SEARCH_RESULT,
    uri: retrievalDocument.sourceUrl ?? "",
    text: stripNullBytes(getDisplayNameForDocument(retrievalDocument)),
    ref: retrievalDocument.reference,
    chunks: retrievalDocument.chunks.map((chunk) => stripNullBytes(chunk.text)),
    id: retrievalDocument.documentId,
    tags: retrievalDocument.tags,
    source: {
      provider:
        retrievalDocument.dataSourceView?.dataSource.connectorProvider ??
        undefined,
    },
  };
}

function createOutputItem(
  resource: SearchQueryResourceType | SearchResultResourceType,
  mcpActionId: ModelId,
  retrievalAction: AgentRetrievalAction
): CreationAttributes<AgentMCPActionOutputItem> {
  return {
    agentMCPActionId: mcpActionId,
    content: {
      type: "resource",
      resource,
    },
    createdAt: retrievalAction.createdAt,
    updatedAt: retrievalAction.updatedAt,
    workspaceId: retrievalAction.workspaceId,
  };
}

async function migrateSingleRetrievalAction(
  auth: Authenticator,
  dustAppsWorkspaceAuth: Authenticator,
  retrievalAction: AgentRetrievalAction,
  agentConfiguration: AgentConfiguration | null,
  logger: Logger,
  {
    execute,
    mcpServerViewForSearchId,
    mcpServerViewForIncludeDataId,
  }: {
    execute: boolean;
    mcpServerViewForSearchId: ModelId;
    mcpServerViewForIncludeDataId: ModelId;
  }
) {
  // Step 1: Convert the legacy retrieval action to an MCP action.
  const mcpAction = agentRetrievalActionToAgentMCPAction(
    retrievalAction,
    agentConfiguration ?? null,
    {
      mcpServerViewForSearchId,
      mcpServerViewForIncludeDataId,
    },
    logger
  );

  // Step 2: Find the corresponding DocumentRetrieval resources.
  // Step 2.1: Fetch first in the current workspace.
  const documentRetrievalsWithChunks =
    await RetrievalDocumentResource.listAllForActions(auth, [
      retrievalAction.id,
    ]);

  const allDocumentRetrievals: RetrievalDocumentResource[] = [
    ...documentRetrievalsWithChunks,
  ];

  // Step 2.2: Fetch in dust-apps workspace as well. This is required to cover for the usage of
  // `@help` agent that relies on public data sources.
  if (agentConfiguration?.sId === GLOBAL_AGENTS_SID["HELPER"]) {
    const dustAppsDocumentRetrievalsWithChunks =
      await RetrievalDocumentResource.listAllForActions(dustAppsWorkspaceAuth, [
        retrievalAction.id,
      ]);

    allDocumentRetrievals.push(...dustAppsDocumentRetrievalsWithChunks);
  }

  logger.info(
    {
      retrievalActionId: retrievalAction.id,
      documentRetrievalsWithChunks: documentRetrievalsWithChunks.length,
    },
    "Found document retrievals with chunks"
  );

  if (execute) {
    // Step 3: Create the MCP action.
    const mcpActionCreated = await AgentMCPAction.create(mcpAction.action);

    const searchQueryResource: SearchQueryResourceType = makeQueryResource(
      retrievalAction.query ?? "",
      getTimeFrameUnit(retrievalAction),
      retrievalAction.tagsIn ?? undefined,
      retrievalAction.tagsNot ?? undefined
    );

    if (documentRetrievalsWithChunks.length > 0) {
      // Step 4: Create the MCP action output items.
      await AgentMCPActionOutputItem.bulkCreate([
        // Create the search query resource.
        createOutputItem(
          searchQueryResource,
          mcpActionCreated.id,
          retrievalAction
        ),
        // Map the document retrievals to search result resources.
        ...documentRetrievalsWithChunks.map((documentRetrieval) =>
          createOutputItem(
            documentRetrievalToSearchResultResourceType(documentRetrieval),
            mcpActionCreated.id,
            retrievalAction
          )
        ),
      ]);

      // Step 5: Delete the legacy retrieval document and chunks.
      // Step 5.1 Delete in the current workspace.
      await RetrievalDocumentResource.deleteAllForActions(auth, [
        retrievalAction.id,
      ]);

      // Step 5.2 Delete in dust-apps workspace.
      await RetrievalDocumentResource.deleteAllForActions(
        dustAppsWorkspaceAuth,
        [retrievalAction.id]
      );
    }
  }
}

async function migrateWorkspaceRetrievalActions(
  workspace: LightWorkspaceType,
  dustAppsWorkspaceAuth: Authenticator,
  logger: Logger,
  { execute }: { execute: boolean }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  const [mcpServerViewForSearch, mcpServerViewForIncludeData] =
    await Promise.all([
      MCPServerViewResource.getMCPServerViewForAutoInternalTool(auth, "search"),
      MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "include_data"
      ),
    ]);

  assert(mcpServerViewForSearch, "Search MCP server view must exist");
  assert(
    mcpServerViewForIncludeData,
    "Include data MCP server view must exist"
  );

  let hasMore = false;
  do {
    // Step 1: Retrieve the legacy retrieval actions.
    const retrievalActions = await AgentRetrievalAction.findAll({
      where: {
        workspaceId: workspace.id,
      },
      limit: BATCH_SIZE,
    });

    if (retrievalActions.length === 0) {
      return;
    }

    logger.info(`Found ${retrievalActions.length} retrieval actions`);

    // Step 2: Find the corresponding AgentMessages.
    const agentMessages = await AgentMessage.findAll({
      where: {
        id: {
          [Op.in]: retrievalActions.map((action) => action.agentMessageId),
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
      retrievalActions,
      async (retrievalAction) => {
        const agentMessage = agentMessagesMap.get(
          retrievalAction.agentMessageId
        );
        assert(agentMessage, "Agent message must exist");

        const agentConfiguration = agentConfigurationsMap.get(
          `${agentMessage.agentConfigurationId}-${agentMessage.agentConfigurationVersion}`
        );
        assert(
          agentConfiguration ||
            isGlobalAgentId(agentMessage.agentConfigurationId),
          "Agent configuration must exist"
        );

        await migrateSingleRetrievalAction(
          auth,
          dustAppsWorkspaceAuth,
          retrievalAction,
          agentConfiguration ?? null,
          logger,
          {
            execute,
            mcpServerViewForSearchId: mcpServerViewForSearch.id,
            mcpServerViewForIncludeDataId: mcpServerViewForIncludeData.id,
          }
        );
      },
      {
        concurrency: CREATION_CONCURRENCY,
      }
    );

    // Step 5: Delete the legacy retrieval actions.
    if (execute) {
      await AgentRetrievalAction.destroy({
        where: {
          id: {
            [Op.in]: retrievalActions.map((action) => action.id),
          },
          workspaceId: workspace.id,
        },
      });
    }

    hasMore = retrievalActions.length === BATCH_SIZE;
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

    const dustAppsWorkspaceAuth = await Authenticator.internalAdminForWorkspace(
      config.getDustAppsWorkspaceId()
    );

    if (workspaceId) {
      const workspace = await getWorkspaceInfos(workspaceId);

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      await migrateWorkspaceRetrievalActions(
        workspace,
        dustAppsWorkspaceAuth,
        logger,
        { execute }
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) =>
          migrateWorkspaceRetrievalActions(
            workspace,
            dustAppsWorkspaceAuth,
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
