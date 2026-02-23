import type {
  ContentNodeAttachmentType,
  ConversationAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { isMultiSheetSpreadsheetContentType } from "@app/lib/api/assistant/conversation/content_types";
import config from "@app/lib/api/config";
import { fetchProjectDataSourceView } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import { CoreAPI } from "@app/types/core/core_api";
import assert from "assert";

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

/**
 * Get the project context datasource view for a conversation's space (if any).
 * Returns null if the conversation not in a space or no project context datasource exists.
 */
export async function getProjectContextDataSourceView(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<DataSourceViewResource | null> {
  if (!isProjectConversation(conversation)) {
    // Conversation not in a space (private conversation).
    return null;
  }

  // Fetch space.
  const space = await SpaceResource.fetchById(auth, conversation.spaceId);
  if (!space) {
    logger.warn(
      {
        conversationId: conversation.sId,
        spaceId: conversation.spaceId,
      },
      "Space not found for conversation"
    );
    return null;
  }

  // Try to fetch the project datasource.
  const res = await fetchProjectDataSourceView(auth, space);

  return res.isOk() ? res.value : null;
}

/**
 * Get datasource views for child conversations that have generated files
 * This allows JIT actions to access files from run_agent child conversations
 */
export async function getConversationDataSourceViews(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  attachments: ConversationAttachmentType[]
): Promise<Map<string, DataSourceViewResource>> {
  const fileIdToDataSourceViewMap = new Map<string, DataSourceViewResource>();

  // Filter to get only file attachments.
  const fileAttachments = attachments.filter(isFileAttachmentType);
  if (fileAttachments.length === 0) {
    return fileIdToDataSourceViewMap;
  }

  const fileIds = fileAttachments.map((a) => a.fileId);
  const fileResources = await FileResource.fetchByIds(auth, fileIds);
  const fileResourceById = new Map(fileResources.map((f) => [f.sId, f]));

  const conversationIds = new Set<string>();
  // Add the current conversation.
  conversationIds.add(conversation.sId);
  // Add conversations from files.
  for (const file of fileResources) {
    if (file.useCaseMetadata?.conversationId) {
      conversationIds.add(file.useCaseMetadata.conversationId);
    }
  }

  const conversations = await ConversationResource.fetchByIds(auth, [
    ...conversationIds,
  ]);

  const conversationModelIdToSId = new Map(
    conversations.map((c) => [c.id, c.sId])
  );

  const dataSourceViews =
    await DataSourceViewResource.fetchByConversationModelIds(
      auth,
      conversations.map((c) => c.id)
    );

  const conversationIdToDataSourceView = new Map<
    string,
    DataSourceViewResource
  >();
  for (const dsv of dataSourceViews) {
    const conversationModelId = dsv.dataSource.conversationId;
    if (conversationModelId) {
      const sId = conversationModelIdToSId.get(conversationModelId);
      if (sId) {
        conversationIdToDataSourceView.set(sId, dsv);
      }
    }
  }

  // Build the result map from file ID to DataSourceView.
  // Only add files that have a conversationId in their metadata.
  for (const attachment of fileAttachments) {
    const fileResource = fileResourceById.get(attachment.fileId);
    if (!fileResource?.useCaseMetadata?.conversationId) {
      continue;
    }

    const dsv = conversationIdToDataSourceView.get(
      fileResource.useCaseMetadata.conversationId
    );
    if (dsv) {
      fileIdToDataSourceViewMap.set(attachment.fileId, dsv);
    }
  }

  return fileIdToDataSourceViewMap;
}
