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
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
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
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types";
import { assertNever, CoreAPI } from "@app/types";

export async function getJITServers(
  auth: Authenticator,
  {
    conversation,
    attachments,
  }: {
    conversation: ConversationType;
    attachments: ConversationAttachmentType[];
  }
): Promise<MCPServerConfigurationType[]> {
  const jitServers: MCPServerConfigurationType[] = [];

  if (attachments.length === 0) {
    return [];
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

  const conversationFilesServer: ServerSideMCPServerConfigurationType = {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: "conversation_files",
    description: "Access and include files from the conversation",
    dataSources: null,
    tables: null,
    childAgentId: null,
    reasoningModel: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: conversationFilesView.sId,
    mcpServerName: conversationFilesView.toJSON().server.name,
    dustAppConfiguration: null,
    internalMCPServerId: conversationFilesView.mcpServerId,
  };

  jitServers.push(conversationFilesServer);

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

  // Get the datasource view for the conversation.
  const conversationDataSourceView =
    await DataSourceViewResource.fetchByConversation(auth, conversation);

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
    // Will only be available for users with the "exploded_tables_query" feature flag.
    let queryTablesView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "query_tables_v2"
      );

    // Fallback to the old query_tables server.
    if (!queryTablesView) {
      queryTablesView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "query_tables"
        );
    }

    assert(
      queryTablesView,
      "MCP server view not found for query_tables. Ensure auto tools are created."
    );

    const tables: TableDataSourceConfiguration[] =
      filesUsableAsTableQuery.flatMap((f) => {
        if (isFileAttachmentType(f)) {
          assert(
            conversationDataSourceView,
            "No conversation datasource view found for table when trying to get JIT actions"
          );
          return f.generatedTables.map((tableId) => ({
            workspaceId: auth.getNonNullableWorkspace().sId,
            dataSourceViewId: conversationDataSourceView.sId,
            tableId,
          }));
        } else if (isContentNodeAttachmentType(f)) {
          return f.generatedTables.map((tableId) => ({
            workspaceId: auth.getNonNullableWorkspace().sId,
            dataSourceViewId: f.nodeDataSourceViewId,
            tableId,
          }));
        }
        assertNever(f);
      });

    const tablesServer: ServerSideMCPServerConfigurationType = {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_server_configuration",
      name: DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
      description: `The tables associated with the 'queryable' conversation files as returned by \`${DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME}\``,
      dataSources: null,
      tables,
      childAgentId: null,
      reasoningModel: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: queryTablesView.sId,
      mcpServerName: queryTablesView.toJSON().server.name,
      dustAppConfiguration: null,
      internalMCPServerId: queryTablesView.mcpServerId,
    };
    jitServers.push(tablesServer);
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
    if (conversationDataSourceView) {
      dataSources.push({
        workspaceId: auth.getNonNullableWorkspace().sId,
        dataSourceViewId: conversationDataSourceView.sId,
        filter: { parents: null, tags: null },
      });
    }

    const retrievalServer: ServerSideMCPServerConfigurationType = {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_server_configuration",
      name: DEFAULT_CONVERSATION_SEARCH_ACTION_NAME,
      description: "Semantic search over all files from the conversation",
      dataSources,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: retrievalView.sId,
      mcpServerName: retrievalView.toJSON().server.name,
      dustAppConfiguration: null,
      internalMCPServerId: retrievalView.mcpServerId,
    };
    jitServers.push(retrievalServer);
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

    // add search server for the folder
    const folderSearchServer: ServerSideMCPServerConfigurationType = {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_server_configuration",
      name: `search_folder_${i}`,
      description: `Search content within the documents inside "${folder.title}"`,
      dataSources,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: retrievalView.sId,
      dustAppConfiguration: null,
      internalMCPServerId: retrievalView.mcpServerId,
      mcpServerName: retrievalView.toJSON().server.name,
    };
    jitServers.push(folderSearchServer);
  }

  return jitServers;
}

async function getTablesFromMultiSheetSpreadsheet(
  auth: Authenticator,
  f: ContentNodeAttachmentType
): Promise<string[]> {
  assert(
    isMultiSheetSpreadsheetContentType(f.contentType),
    `Unexpected: ${f.title} is not a multi-sheet spreadsheet`
  );

  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    f.nodeDataSourceViewId
  );

  assert(
    dataSourceView,
    `Unexpected: No datasource view found for datasource view id ${f.nodeDataSourceViewId}`
  );

  const coreApi = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchResult = await coreApi.searchNodes({
    filter: {
      parent_id: f.nodeId,
      data_source_views: [
        {
          data_source_id: dataSourceView.dataSource.dustAPIDataSourceId,
          view_filter: [f.nodeId],
        },
      ],
    },
  });

  if (searchResult.isErr()) {
    throw new Error(
      `Unexpected: Failed to get tables from multi-sheet spreadsheet: ${searchResult.error}`
    );
  }

  // Children of multi-sheet spreadsheets are exclusively tables.
  return searchResult.value.nodes.map((n) => n.node_id);
}
