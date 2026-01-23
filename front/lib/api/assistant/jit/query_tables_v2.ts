import assert from "assert";

import {
  DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
  DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { TableDataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { isMultiSheetSpreadsheetContentType } from "@app/lib/api/assistant/conversation/content_types";
import {
  getConversationDataSourceViews,
  getTablesFromMultiSheetSpreadsheet,
} from "@app/lib/api/assistant/jit/utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types";

/**
 * Get the query_tables_v2 MCP server for querying CSV/Excel files.
 * Only created if conversation has queryable attachments (tables).
 */
export async function getQueryTablesServer(
  auth: Authenticator,

  conversation: ConversationWithoutContentType,
  attachments: ConversationAttachmentType[]
): Promise<ServerSideMCPServerConfigurationType | null> {
  const filesUsableAsTableQuery = attachments.filter((f) => f.isQueryable);

  if (filesUsableAsTableQuery.length === 0) {
    return null;
  }

  // Get datasource views for child conversations that have generated files.
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
    { concurrency: 10 }
  );

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

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME,
    description: `The tables associated with the 'queryable' conversation files as returned by \`${DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME}\``,
    dataSources: null,
    tables,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    additionalConfiguration: {},
    mcpServerViewId: queryTablesView.sId,
    dustAppConfiguration: null,
    internalMCPServerId: queryTablesView.mcpServerId,
  };
}
