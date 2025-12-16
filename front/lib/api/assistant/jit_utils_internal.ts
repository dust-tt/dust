import assert from "assert";

import type { ContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { isMultiSheetSpreadsheetContentType } from "@app/lib/api/assistant/conversation/content_types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types";
import { CoreAPI } from "@app/types";

import type { ConversationAttachmentType } from "./conversation/attachments";

/**
 * Get datasource views for child conversations that have generated files.
 * This allows JIT actions to access files from run_agent child conversations.
 */
export async function getConversationDataSourceViews(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  attachments: ConversationAttachmentType[]
): Promise<Map<string, DataSourceViewResource>> {
  const conversationIdToDataSourceViewMap = new Map<
    string,
    DataSourceViewResource
  >();

  // Get the datasource view for the conversation.
  const conversationDataSourceView =
    await DataSourceViewResource.fetchByConversation(auth, conversation);
  if (conversationDataSourceView) {
    conversationIdToDataSourceViewMap.set(
      conversation.sId,
      conversationDataSourceView
    );
  }

  const fileIdToDataSourceViewMap = new Map<string, DataSourceViewResource>();

  // Check file attachments for their conversation metadata
  for (const attachment of attachments) {
    if (isFileAttachmentType(attachment)) {
      try {
        // Get the file resource to access its metadata
        const fileResource = await FileResource.fetchById(
          auth,
          attachment.fileId
        );
        if (fileResource && fileResource.useCaseMetadata?.conversationId) {
          const fileConversationId =
            fileResource.useCaseMetadata.conversationId;

          // First look in already fetched conversations
          const cachedChildDataSourceView =
            conversationIdToDataSourceViewMap.get(fileConversationId);
          if (cachedChildDataSourceView) {
            fileIdToDataSourceViewMap.set(
              attachment.fileId,
              cachedChildDataSourceView
            );
            continue;
          }

          // Fetch the datasource view for this conversation
          const childConversation =
            await ConversationResource.fetchConversationWithoutContent(
              auth,
              fileConversationId
            );

          if (childConversation.isErr()) {
            logger.warn(
              `Could not find child conversation with sId: ${fileConversationId}`
            );
            continue;
          }

          const childDataSourceView =
            await DataSourceViewResource.fetchByConversation(
              auth,
              childConversation.value
            );

          if (childDataSourceView) {
            conversationIdToDataSourceViewMap.set(
              childConversation.value.sId,
              childDataSourceView
            );
            // Map this file to its datasource view
            fileIdToDataSourceViewMap.set(
              attachment.fileId,
              childDataSourceView
            );
          }
        }
      } catch (error) {
        logger.warn(
          `Failed to get file metadata for file ${attachment.fileId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  return fileIdToDataSourceViewMap;
}

export async function getTablesFromMultiSheetSpreadsheet(
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
