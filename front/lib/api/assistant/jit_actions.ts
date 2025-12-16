import assert from "assert";

import {
  DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
  DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type {
  MCPServerConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type {
  ContentNodeAttachmentType,
  ConversationAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentFragmentDataSourceNode,
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { isMultiSheetSpreadsheetContentType } from "@app/lib/api/assistant/conversation/content_types";
import { isSearchableFolder } from "@app/lib/api/assistant/jit_utils";
import {
  getConversationDataSourceViews,
  getTablesFromMultiSheetSpreadsheet,
} from "@app/lib/api/assistant/jit_utils_internal";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  ConversationWithoutContentType,
} from "@app/types";

function makeJITServerSideMCPServerConfiguration({
  name,
  description,
  mcpServerView,
  dataSources = null,
  tables = null,
}: {
  name: string;
  description: string;
  mcpServerView: MCPServerViewResource;
  dataSources?: DataSourceConfiguration[] | null;
  tables?: TableDataSourceConfiguration[] | null;
}): ServerSideMCPServerConfigurationType {
  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name,
    description,
    dataSources,
    tables,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    additionalConfiguration: {},
    mcpServerViewId: mcpServerView.sId,
    dustAppConfiguration: null,
    internalMCPServerId:
      mcpServerView.serverType === "internal"
        ? mcpServerView.mcpServerId
        : null,
  };
}

export async function getJITServers(
  auth: Authenticator,
  {
    agentConfiguration,
    conversation,
    attachments,
  }: {
    agentConfiguration: AgentConfigurationType;
    conversation: ConversationWithoutContentType;
    attachments: ConversationAttachmentType[];
  }
): Promise<MCPServerConfigurationType[]> {
  const jitServers: MCPServerConfigurationType[] = [];

  // Get the conversation MCP server views (aka Tools)
  const conversationMCPServerViews =
    await ConversationResource.fetchMCPServerViews(auth, conversation, true);

  const commonUtilitiesView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "common_utilities"
    );

  for (const conversationMCPServerView of conversationMCPServerViews) {
    const mcpServerViewResource = await MCPServerViewResource.fetchByModelPk(
      auth,
      conversationMCPServerView.mcpServerViewId
    );

    if (!mcpServerViewResource) {
      continue;
    }

    const mcpServerView = mcpServerViewResource.toJSON();

    jitServers.push(
      makeJITServerSideMCPServerConfiguration({
        name: mcpServerView.name ?? mcpServerView.server.name,
        description:
          mcpServerView.description ?? mcpServerView.server.description,
        mcpServerView: mcpServerViewResource,
      })
    );
  }

  if (!commonUtilitiesView) {
    logger.warn(
      {
        agentConfigurationId: agentConfiguration.sId,
        conversationId: conversation.sId,
      },
      "MCP server view not found for common_utilities. Ensure auto tools are created."
    );
  } else {
    const commonUtilitiesViewJSON = commonUtilitiesView.toJSON();
    jitServers.push(
      makeJITServerSideMCPServerConfiguration({
        name:
          commonUtilitiesViewJSON.name ?? commonUtilitiesViewJSON.server.name,
        description:
          commonUtilitiesViewJSON.description ??
          commonUtilitiesViewJSON.server.description,
        mcpServerView: commonUtilitiesView,
      })
    );
  }

  // Add skill_management MCP server if the agent has any skills configured
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (featureFlags.includes("skills")) {
    // TODO(resources): Add a countSkills method to the future AgentConfigurationResource
    // and use that instead of querying the model directly.
    const skillCount = await AgentSkillModel.count({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId: owner.id,
      },
    });

    if (skillCount > 0) {
      const skillManagementView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          SKILL_MANAGEMENT_SERVER_NAME
        );

      if (!skillManagementView) {
        logger.warn(
          {
            agentConfigurationId: agentConfiguration.sId,
            conversationId: conversation.sId,
          },
          "MCP server view not found for skill_management. Ensure auto tools are created."
        );
      } else {
        jitServers.push(
          makeJITServerSideMCPServerConfiguration({
            name: SKILL_MANAGEMENT_SERVER_NAME,
            description: "Enable skills for the conversation.",
            mcpServerView: skillManagementView,
          })
        );
      }
    }
  }

  if (attachments.length === 0) {
    return jitServers;
  }

  // Add conversation_files MCP server if there are conversation files
  const conversationFilesView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "conversation_files"
    );

  assert(
    conversationFilesView,
    "MCP server view not found for conversation_files. Ensure auto tools are created."
  );

  jitServers.push(
    makeJITServerSideMCPServerConfiguration({
      name: "conversation_files",
      description: "Access and include files from the conversation",
      mcpServerView: conversationFilesView,
    })
  );

  // Check tables for the table query action.
  const filesUsableAsTableQuery = attachments.filter((f) => f.isQueryable);

  // Check files for the retrieval query action.
  const filesUsableAsRetrievalQuery = attachments.filter((f) => f.isSearchable);

  if (
    filesUsableAsTableQuery.length === 0 &&
    filesUsableAsRetrievalQuery.length === 0
  ) {
    return jitServers;
  }

  // Get datasource views for child conversations that have generated files
  const fileIdToDataSourceViewMap = await getConversationDataSourceViews(
    auth,
    conversation,
    attachments
  );

  // Assign tables to multi-sheet spreadsheets.
  await concurrentExecutor(
    filesUsableAsTableQuery.filter((f) =>
      isMultiSheetSpreadsheetContentType(f.contentType)
    ),
    async (f) => {
      assert(
        isContentNodeAttachmentType(f),
        "Unreachable: file should be a content node"
      );
      f.generatedTables = await getTablesFromMultiSheetSpreadsheet(auth, f);
    },
    {
      concurrency: 10,
    }
  );

  if (filesUsableAsTableQuery.length > 0) {
    // Get the query_tables MCP server view

    // Try to get the new query_tables_v2 server.
    const queryTablesView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "query_tables_v2"
      );

    assert(
      queryTablesView,
      "MCP server view not found for query_tables_v2. Ensure auto tools are created."
    );

    const tables: TableDataSourceConfiguration[] = [];

    for (const f of filesUsableAsTableQuery) {
      if (isFileAttachmentType(f)) {
        // For file attachments, we need to find which datasource they belong to
        // Check if it's from the current conversation or a child conversation
        const dataSourceView = fileIdToDataSourceViewMap.get(f.fileId);

        if (!dataSourceView) {
          logger.warn(
            {
              fileId: f.fileId,
              conversationId: conversation.sId,
            },
            "Could not find datasource view for file in table query"
          );
          continue;
        }

        for (const tableId of f.generatedTables) {
          tables.push({
            workspaceId: auth.getNonNullableWorkspace().sId,
            dataSourceViewId: dataSourceView.sId,
            tableId,
          });
        }
      } else if (isContentNodeAttachmentType(f)) {
        for (const tableId of f.generatedTables) {
          tables.push({
            workspaceId: auth.getNonNullableWorkspace().sId,
            dataSourceViewId: f.nodeDataSourceViewId,
            tableId,
          });
        }
      }
    }

    jitServers.push(
      makeJITServerSideMCPServerConfiguration({
        name: DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
        description: `The tables associated with the 'queryable' conversation files as returned by \`${DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME}\``,
        mcpServerView: queryTablesView,
        tables,
      })
    );
  }

  // Get the retrieval view once - we'll need it for search functionality
  const retrievalView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "search"
    );

  assert(
    retrievalView,
    "MCP server view not found for search. Ensure auto tools are created."
  );

  if (filesUsableAsRetrievalQuery.length > 0) {
    const contentNodeAttachments: ContentNodeAttachmentType[] = [];
    for (const f of filesUsableAsRetrievalQuery) {
      if (isContentNodeAttachmentType(f)) {
        contentNodeAttachments.push(f);
      }
    }
    const dataSources: DataSourceConfiguration[] = contentNodeAttachments.map(
      (f) => ({
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceViewId: f.nodeDataSourceViewId,
        filter: {
          parents: {
            in: [f.nodeId],
            not: [],
          },
          tags: null,
        },
      })
    );

    const dataSourceIds = new Set(
      [...fileIdToDataSourceViewMap.values()].map(
        (dataSourceView) => dataSourceView.sId
      )
    );

    // Add datasources for both current conversation and child conversations
    for (const dataSourceViewId of dataSourceIds.values()) {
      dataSources.push({
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceViewId,
        filter: { parents: null, tags: null },
      });
    }

    jitServers.push(
      makeJITServerSideMCPServerConfiguration({
        name: DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
        description: "Semantic search over all files from the conversation",
        mcpServerView: retrievalView,
        dataSources,
      })
    );
  }

  const searchableFolders: ContentNodeAttachmentType[] = [];
  for (const attachment of attachments) {
    if (
      isContentNodeAttachmentType(attachment) &&
      isSearchableFolder(attachment)
    ) {
      searchableFolders.push(attachment);
    }
  }
  for (const [i, folder] of searchableFolders.entries()) {
    const dataSources: DataSourceConfiguration[] = [
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceViewId: folder.nodeDataSourceViewId,
        filter: {
          // Do not filter on parent if the folder is a data source node.
          parents: isContentFragmentDataSourceNode(folder)
            ? null
            : {
                in: [folder.nodeId],
                not: [],
              },
          tags: null,
        },
      },
    ];

    jitServers.push(
      makeJITServerSideMCPServerConfiguration({
        name: `search_folder_${i}`,
        description: `Search content within the documents inside "${folder.title}"`,
        mcpServerView: retrievalView,
        dataSources,
      })
    );
  }

  return jitServers;
}
