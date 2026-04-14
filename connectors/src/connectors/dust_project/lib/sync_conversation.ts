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
  buildConversationMessageSections,
  chunkMessageSectionsForDocuments,
  formatConversationSectionsForUpsert,
  getConversationDocumentUpsertTitle,
  getConversationFolderInternalId,
  getConversationMessageInternalId,
  getConversationPartDocumentInternalId,
} from "./conversation_formatting";

async function deleteConversationDocumentSafe(
  dataSourceConfig: DataSourceConfig,
  documentId: string,
  loggerArgs: Record<string, string | number>
): Promise<void> {
  await deleteDataSourceDocument(dataSourceConfig, documentId, loggerArgs);
}

/**
 * Best-effort DELETE for `base-part-{n}` with 1-based `n` in
 * `[startPartIndex, startPartIndex + attemptCount)` (e.g. `1` + `previousParts` ⇒ parts `1…previousParts`).
 */
async function deletePartDocumentShardsBestEffort(
  dataSourceConfig: DataSourceConfig,
  baseDocumentId: string,
  startPartIndex: number,
  attemptCount: number,
  loggerArgs: Record<string, string | number>
): Promise<void> {
  const endExclusive = startPartIndex + attemptCount;
  for (let p = startPartIndex; p < endExclusive; p++) {
    await deleteConversationDocumentSafe(
      dataSourceConfig,
      getConversationPartDocumentInternalId(baseDocumentId, p),
      loggerArgs
    );
  }
}

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
    const baseDocumentId = getConversationMessageInternalId(
      connectorId,
      projectId,
      conversationId
    );

    const existingConversation =
      await DustProjectConversationResource.fetchByConnectorIdAndConversationId(
        connectorId,
        conversationId
      );

    const storedParts = existingConversation?.documentPartCount ?? 1;

    await deleteConversationDocumentSafe(dataSourceConfig, baseDocumentId, {
      conversationId,
      projectId,
    });

    if (storedParts > 1) {
      await deletePartDocumentShardsBestEffort(
        dataSourceConfig,
        baseDocumentId,
        1,
        storedParts,
        { conversationId, projectId }
      );
    }

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
 * Large conversations are split into multiple documents (`conversation_formatting`). If this
 * conversation was synced before, prior `base-part-*` shards are removed after the folder upsert
 * so layout changes always replace split documents cleanly.
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
    const messageSections = buildConversationMessageSections(conversation);
    const chunks = chunkMessageSectionsForDocuments(messageSections);
    const totalParts = chunks.length;

    const baseDocumentId = getConversationMessageInternalId(
      connectorId,
      projectId,
      conversation.sId
    );

    const folderInternalId = getConversationFolderInternalId(
      connectorId,
      projectId
    );

    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: folderInternalId,
      parents: [folderInternalId],
      parentId: null,
      title: `Conversations`,
      mimeType: INTERNAL_MIME_TYPES.DUST_PROJECT.CONVERSATION_FOLDER,
    });

    const existingConversation =
      await DustProjectConversationResource.fetchByConnectorIdAndConversationId(
        connectorId,
        conversation.sId
      );

    // Clean up existing conversation documents if they exist
    if (existingConversation) {
      const storedParts = existingConversation?.documentPartCount ?? 1;

      await deleteConversationDocumentSafe(dataSourceConfig, baseDocumentId, {
        conversationId: conversation.sId,
        projectId,
      });

      if (storedParts > 1) {
        await deletePartDocumentShardsBestEffort(
          dataSourceConfig,
          baseDocumentId,
          1,
          storedParts,
          { conversationId: conversation.sId, projectId }
        );
      }
    }

    if (totalParts === 1) {
      const documentContent = await formatConversationSectionsForUpsert({
        dataSourceConfig,
        conversation,
        sections: chunks[0] ?? [],
        partIndex: 1,
        totalParts: 1,
      });

      await upsertDataSourceDocument({
        dataSourceConfig,
        documentId: baseDocumentId,
        documentContent,
        timestampMs: conversation.updated ?? conversation.created,
        tags: [`project:${projectId}`, `conversation:${conversation.sId}`],
        documentUrl: conversation.url,
        parents: [baseDocumentId, folderInternalId],
        parentId: folderInternalId,
        upsertContext: {
          sync_type: syncType,
        },
        title: getConversationDocumentUpsertTitle(conversation, 1, 1),
        mimeType: INTERNAL_MIME_TYPES.DUST_PROJECT.CONVERSATION_MESSAGES,
        async: true,
        loggerArgs: {
          conversationId: conversation.sId,
          projectId,
        },
      });
    } else {
      for (let i = 0; i < totalParts; i++) {
        const partIndex = i + 1;
        const partDocumentId = getConversationPartDocumentInternalId(
          baseDocumentId,
          partIndex
        );
        const documentContent = await formatConversationSectionsForUpsert({
          dataSourceConfig,
          conversation,
          sections: chunks[i] ?? [],
          partIndex,
          totalParts,
        });

        await upsertDataSourceDocument({
          dataSourceConfig,
          documentId: partDocumentId,
          documentContent,
          timestampMs: conversation.updated ?? conversation.created,
          tags: [`project:${projectId}`, `conversation:${conversation.sId}`],
          documentUrl: conversation.url,
          parents: [partDocumentId, folderInternalId],
          parentId: folderInternalId,
          upsertContext: {
            sync_type: syncType,
          },
          title: getConversationDocumentUpsertTitle(
            conversation,
            partIndex,
            totalParts
          ),
          mimeType: INTERNAL_MIME_TYPES.DUST_PROJECT.CONVERSATION_MESSAGES,
          async: true,
          loggerArgs: {
            conversationId: conversation.sId,
            projectId,
            partIndex,
            totalParts,
          },
        });
      }
    }

    if (existingConversation) {
      await existingConversation.update({
        lastSyncedAt: new Date(),
        sourceUpdatedAt,
        documentPartCount: totalParts,
      });
    } else {
      await DustProjectConversationResource.makeNew({
        connectorId,
        conversationId: conversation.sId,
        projectId,
        sourceUpdatedAt,
        documentPartCount: totalParts,
      });
    }

    localLogger.info({ totalParts }, "Successfully synced conversation");
  } catch (error) {
    localLogger.error({ error }, "Failed to sync conversation");
    throw error;
  }
}
