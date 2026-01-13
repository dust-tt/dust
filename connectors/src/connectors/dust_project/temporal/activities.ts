import { syncConversation } from "@connectors/connectors/dust_project/lib/sync_conversation";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getDustAPI } from "@connectors/lib/api/dust_api";
import { deleteDataSourceDocument } from "@connectors/lib/data_sources";
import {
  syncFailed,
  syncStarted,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { DustProjectConfigurationResource } from "@connectors/resources/dust_project_configuration_resource";
import { DustProjectConversationResource } from "@connectors/resources/dust_project_conversation_resource";
import type { ModelId } from "@connectors/types";
import { concurrentExecutor } from "@connectors/types";

/**
 * Full sync activity: Syncs all conversations for a project.
 * This is used for initial syncs or when force resync is requested.
 */
export async function dustProjectFullSyncActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  const localLogger = logger.child({ connectorId });

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const configuration =
    await DustProjectConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(`Configuration not found for connector ${connectorId}`);
  }

  await syncStarted(connectorId);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  try {
    localLogger.info(
      { projectId: configuration.projectId },
      "Starting full sync for dust_project connector"
    );

    // Fetch all conversations for the project from Front API
    const dustAPI = getDustAPI(dataSourceConfig, { useInternalAPI: false });
    const conversationsResult =
      await dustAPI.getSpaceConversationsForDataSource({
        spaceId: configuration.projectId,
      });

    if (conversationsResult.isErr()) {
      throw new Error(
        `Failed to fetch conversations: ${conversationsResult.error.message}`
      );
    }

    const conversations = conversationsResult.value.conversations;
    localLogger.info(
      { projectId: configuration.projectId, count: conversations.length },
      "Fetched conversations for full sync"
    );

    // Sync each conversation
    // conversations is an array of ConversationSchema objects (full ConversationType)
    await concurrentExecutor(
      conversations,
      async (conversation) => {
        await syncConversation({
          connectorId,
          dataSourceConfig,
          projectId: configuration.projectId,
          conversation: conversation,
          syncType: "batch",
        });
      },
      { concurrency: 5 } // Process 5 conversations at a time
    );

    // Update lastSyncedAt
    await configuration.update({ lastSyncedAt: new Date() });

    await syncSucceeded(connectorId);
  } catch (error) {
    localLogger.error(
      { error, projectId: configuration.projectId },
      "Full sync failed for dust_project connector"
    );
    await syncFailed(connectorId, "third_party_internal_error");
    throw error;
  }
}

/**
 * Incremental sync activity: Syncs only conversations updated since last sync.
 */
export async function dustProjectIncrementalSyncActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  const localLogger = logger.child({ connectorId });

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const configuration =
    await DustProjectConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(`Configuration not found for connector ${connectorId}`);
  }

  await syncStarted(connectorId);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  try {
    localLogger.info(
      { projectId: configuration.projectId },
      "Starting incremental sync for dust_project connector"
    );

    // Get lastSyncedAt from configuration
    const lastSyncedAt = configuration.lastSyncedAt
      ? configuration.lastSyncedAt.getTime()
      : null;

    // Fetch conversations updated since lastSyncedAt from Front API
    const dustAPI = getDustAPI(dataSourceConfig, { useInternalAPI: false });
    const conversationsResult =
      await dustAPI.getSpaceConversationsForDataSource({
        spaceId: configuration.projectId,
        updatedSince: lastSyncedAt,
      });

    if (conversationsResult.isErr()) {
      throw new Error(
        `Failed to fetch conversations: ${conversationsResult.error.message}`
      );
    }

    const conversations = conversationsResult.value.conversations;
    localLogger.info(
      {
        projectId: configuration.projectId,
        count: conversations.length,
        lastSyncedAt,
      },
      "Fetched conversations for incremental sync"
    );

    // Sync each conversation
    // conversations is an array of ConversationSchema objects (full ConversationType)
    await concurrentExecutor(
      conversations,
      async (conversation) => {
        await syncConversation({
          connectorId,
          dataSourceConfig,
          projectId: configuration.projectId,
          conversation: conversation,
          syncType: "incremental",
        });
      },
      { concurrency: 5 } // Process 5 conversations at a time
    );

    // Update lastSyncedAt
    await configuration.update({ lastSyncedAt: new Date() });

    await syncSucceeded(connectorId);
  } catch (error) {
    localLogger.error(
      { error, projectId: configuration.projectId },
      "Incremental sync failed for dust_project connector"
    );
    await syncFailed(connectorId, "third_party_internal_error");
    throw error;
  }
}

/**
 * Garbage collection activity: Removes conversations that no longer exist in the project.
 */
export async function dustProjectGarbageCollectActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  const localLogger = logger.child({ connectorId });

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const configuration =
    await DustProjectConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(`Configuration not found for connector ${connectorId}`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  try {
    localLogger.info(
      { projectId: configuration.projectId },
      "Starting garbage collection for dust_project connector"
    );

    // Fetch all conversation IDs currently in the project from Front API
    const dustAPI = getDustAPI(dataSourceConfig, { useInternalAPI: false });
    const conversationsResult =
      await dustAPI.getSpaceConversationsForDataSource({
        spaceId: configuration.projectId,
      });

    if (conversationsResult.isErr()) {
      throw new Error(
        `Failed to fetch conversations: ${conversationsResult.error.message}`
      );
    }

    const currentConversationIds = new Set(
      conversationsResult.value.conversations.map((c) => c.sId)
    );

    // Fetch all conversation IDs from dust_project_conversations table
    const syncedConversations =
      await DustProjectConversationResource.fetchByConnectorId(connectorId);

    // Find conversations that exist in DB but not in project
    const conversationsToDelete = syncedConversations.filter(
      (c) => !currentConversationIds.has(c.conversationId)
    );

    localLogger.info(
      {
        projectId: configuration.projectId,
        currentCount: currentConversationIds.size,
        syncedCount: syncedConversations.length,
        toDeleteCount: conversationsToDelete.length,
      },
      "Identified conversations to delete"
    );

    // Delete conversations from data source and database
    await concurrentExecutor(
      conversationsToDelete,
      async (conversation) => {
        const messageInternalId = `dust-project-${connectorId}-project-${configuration.projectId}-conversation-${conversation.conversationId}`;

        // Delete from data source
        try {
          await deleteDataSourceDocument(dataSourceConfig, messageInternalId, {
            conversationId: conversation.conversationId,
          });
        } catch (error) {
          localLogger.warn(
            { conversationId: conversation.conversationId, error },
            "Failed to delete conversation from data source, continuing"
          );
        }

        // Delete from database
        await conversation.delete();
      },
      { concurrency: 5 }
    );

    localLogger.info(
      {
        projectId: configuration.projectId,
        deletedCount: conversationsToDelete.length,
      },
      "Garbage collection completed for dust_project connector"
    );
  } catch (error) {
    localLogger.error(
      { error, projectId: configuration.projectId },
      "Garbage collection failed for dust_project connector"
    );
    throw error;
  }
}
