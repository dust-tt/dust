import {
  deleteDataSourceDocument,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import { DustProjectConversationResource } from "@connectors/resources/dust_project_conversation_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types/shared/internal_mime_types";
import type { ConversationPublicType } from "@dust-tt/client";

import {
  formatConversationForUpsert,
  getConversationFolderInternalId,
  getConversationMessageInternalId,
} from "./conversation_formatting";

/**
 * Deletes a conversation from the data source and database.
 */
export async function deleteConversation({
  connectorId,
  dataSourceConfig,
  projectId,
  conversationId,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  projectId: string;
  conversationId: string;
}): Promise<void> {
  const localLogger = logger.child({
    connectorId,
    conversationId,
    projectId,
  });

  try {
    const messageInternalId = getConversationMessageInternalId(
      connectorId,
      projectId,
      conversationId
    );

    // Delete from data source
    await deleteDataSourceDocument(dataSourceConfig, messageInternalId, {
      conversationId,
      projectId,
    });

    // Delete from database
    const existingConversation =
      await DustProjectConversationResource.fetchByConnectorIdAndConversationId(
        connectorId,
        conversationId
      );

    if (existingConversation) {
      await existingConversation.delete();
    }

    localLogger.info("Successfully deleted conversation");
  } catch (error) {
    localLogger.error({ error }, "Failed to delete conversation");
    throw error;
  }
}

/**
 * Syncs a single conversation: formats it from raw content and upserts it to the data source.
 * If the conversation is deleted (visibility === "deleted"), it will be removed from the data source.
 */
export async function syncConversation({
  connectorId,
  dataSourceConfig,
  projectId,
  conversation,
  syncType,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  projectId: string;
  conversation: ConversationPublicType;
  syncType: "batch" | "incremental";
}): Promise<void> {
  const localLogger = logger.child({
    connectorId,
    conversationId: conversation.sId,
    projectId,
  });

  // If conversation is deleted, remove it from the data source
  if (conversation.visibility === "deleted") {
    await deleteConversation({
      connectorId,
      dataSourceConfig,
      projectId,
      conversationId: conversation.sId,
    });
    return;
  }

  const sourceUpdatedAt = new Date(
    conversation.updated ?? conversation.created
  );

  try {
    // Format conversation for upsert (converts raw content to plain text)
    const documentContent = await formatConversationForUpsert({
      dataSourceConfig,
      conversation,
    });

    // Generate internal IDs
    const folderInternalId = getConversationFolderInternalId(
      connectorId,
      projectId
    );
    const messageInternalId = getConversationMessageInternalId(
      connectorId,
      projectId,
      conversation.sId
    );

    // Ensure folder exists (idempotent)
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: folderInternalId,
      parents: [folderInternalId],
      parentId: null,
      title: `Conversations`,
      mimeType: INTERNAL_MIME_TYPES.DUST_PROJECT.CONVERSATION_FOLDER,
    });

    // Upsert conversation document
    await upsertDataSourceDocument({
      dataSourceConfig,
      documentId: messageInternalId,
      documentContent,
      timestampMs: conversation.updated ?? conversation.created,
      tags: [`project:${projectId}`, `conversation:${conversation.sId}`],
      documentUrl: conversation.url,
      parents: [messageInternalId, folderInternalId],
      parentId: folderInternalId,
      upsertContext: {
        sync_type: syncType,
      },
      title: conversation.title || `Conversation ${conversation.sId}`,
      mimeType: INTERNAL_MIME_TYPES.DUST_PROJECT.CONVERSATION_MESSAGES,
      async: true,
      loggerArgs: {
        conversationId: conversation.sId,
        projectId,
      },
    });

    // Update or insert conversation record

    const existingConversation =
      await DustProjectConversationResource.fetchByConnectorIdAndConversationId(
        connectorId,
        conversation.sId
      );

    if (existingConversation) {
      await existingConversation.update({
        lastSyncedAt: new Date(),
        sourceUpdatedAt,
      });
    } else {
      await DustProjectConversationResource.makeNew({
        connectorId,
        conversationId: conversation.sId,
        projectId,
        sourceUpdatedAt,
      });
    }

    localLogger.info("Successfully synced conversation");
  } catch (error) {
    localLogger.error({ error }, "Failed to sync conversation");
    throw error;
  }
}
