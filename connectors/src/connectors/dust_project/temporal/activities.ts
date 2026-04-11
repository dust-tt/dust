import {
  deleteConversation,
  syncConversation,
} from "@connectors/connectors/dust_project/lib/sync_conversation";
import { syncProjectMetadata } from "@connectors/connectors/dust_project/lib/sync_metadata";
import { launchDustProjectIncrementalSyncWorkflow } from "@connectors/connectors/dust_project/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { getDustAPI } from "@connectors/lib/api/dust_api";
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
export async function dustProjectConversationsFullSyncActivity({
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
      "Fetched conversations for full sync (including deleted)"
    );

    // Get all currently synced conversation IDs
    const syncedConversations =
      await DustProjectConversationResource.fetchByConnectorId(connectorId);

    // Get all conversation IDs from the fetched list (including deleted ones)
    const fetchedConversationIds = new Set(conversations.map((c) => c.sId));

    // Find conversations that exist in DB but not in fetched list (should be deleted)
    const conversationsToDelete = syncedConversations.filter(
      (c) => !fetchedConversationIds.has(c.conversationId)
    );

    // Delete conversations that no longer exist
    if (conversationsToDelete.length > 0) {
      localLogger.info(
        {
          projectId: configuration.projectId,
          count: conversationsToDelete.length,
        },
        "Deleting conversations that no longer exist"
      );
      await concurrentExecutor(
        conversationsToDelete,
        async (conversation) => {
          await deleteConversation({
            connectorId,
            dataSourceConfig,
            projectId: configuration.projectId,
            conversationId: conversation.conversationId,
          });
        },
        { concurrency: 5 }
      );
    }

    // Sync each conversation (including deleted ones - syncConversation handles deletion)
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

    // Launch incremental sync workflow after successful full sync
    const incrementalSyncResult =
      await launchDustProjectIncrementalSyncWorkflow(connectorId);
    if (incrementalSyncResult.isErr()) {
      localLogger.error(
        {
          error: incrementalSyncResult.error,
          projectId: configuration.projectId,
        },
        "Failed to launch incremental sync workflow after full sync"
      );
      // Don't fail the full sync if incremental sync launch fails
    } else {
      localLogger.info(
        {
          workflowId: incrementalSyncResult.value,
          projectId: configuration.projectId,
        },
        "Launched incremental sync workflow after successful full sync"
      );
    }
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
export async function dustProjectConversationsIncrementalSyncActivity({
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

    // Watermark: max source `updatedAt` we have synced. Front's `updatedSince` filter uses
    // `updatedAt >= updatedSince` (inclusive), so passing the raw max would re-fetch every
    // conversation at that timestamp every run. Use max+1 so `>=` behaves like strictly after max.
    const maxSourceUpdatedAt =
      await DustProjectConversationResource.getMaxSourceUpdatedAt(connectorId);

    const dustAPI = getDustAPI(dataSourceConfig, { useInternalAPI: false });
    const conversationsResult =
      await dustAPI.getSpaceConversationsForDataSource({
        spaceId: configuration.projectId,
        updatedSince:
          maxSourceUpdatedAt != null
            ? maxSourceUpdatedAt.getTime() + 1
            : undefined,
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
        lastSourceUpdatedAt: maxSourceUpdatedAt,
      },
      "Fetched conversations for incremental sync (including deleted)"
    );

    // Sync each conversation (including deleted ones - syncConversation handles deletion)
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

    // Run garbage collection to remove hard-deleted conversations
    // This checks for conversations that were completely removed from the database
    await dustProjectConversationsGarbageCollectActivity({ connectorId });
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
 * Garbage collection activity: Removes conversations that were hard-deleted
 * (completely removed from the database, not just soft-deleted).
 * This is called after incremental sync to clean up conversations that no longer exist.
 */
async function dustProjectConversationsGarbageCollectActivity({
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
      "Starting garbage collection for hard-deleted conversations"
    );

    // Fetch all visible conversation IDs from Front API
    // This endpoint only returns conversations that still exist (not hard-deleted)
    const dustAPI = getDustAPI(dataSourceConfig, { useInternalAPI: false });
    const conversationIdsResult = await dustAPI.getSpaceConversationIds({
      spaceId: configuration.projectId,
    });

    if (conversationIdsResult.isErr()) {
      throw new Error(
        `Failed to fetch conversation IDs: ${conversationIdsResult.error.message}`
      );
    }

    const currentConversationIds = new Set(
      conversationIdsResult.value.conversationIds
    );

    // Fetch all conversation IDs from dust_project_conversations table
    const syncedConversations =
      await DustProjectConversationResource.fetchByConnectorId(connectorId);

    // Find conversations that exist in DB but not in the current list (hard-deleted)
    const conversationsToDelete = syncedConversations.filter(
      (c) => !currentConversationIds.has(c.conversationId)
    );

    if (conversationsToDelete.length === 0) {
      localLogger.info(
        {
          projectId: configuration.projectId,
          currentCount: currentConversationIds.size,
          syncedCount: syncedConversations.length,
        },
        "No hard-deleted conversations found"
      );
      return;
    }

    localLogger.info(
      {
        projectId: configuration.projectId,
        currentCount: currentConversationIds.size,
        syncedCount: syncedConversations.length,
        toDeleteCount: conversationsToDelete.length,
      },
      "Identified hard-deleted conversations to remove"
    );

    // Delete conversations from data source and database
    await concurrentExecutor(
      conversationsToDelete,
      async (conversation) => {
        await deleteConversation({
          connectorId,
          dataSourceConfig,
          projectId: configuration.projectId,
          conversationId: conversation.conversationId,
        });
      },
      { concurrency: 5 }
    );

    localLogger.info(
      {
        projectId: configuration.projectId,
        deletedCount: conversationsToDelete.length,
      },
      "Garbage collection completed for hard-deleted conversations"
    );
  } catch (error) {
    localLogger.error(
      { error, projectId: configuration.projectId },
      "Garbage collection failed for dust_project connector"
    );
    // Don't throw - garbage collection failures shouldn't fail the sync
    // Log the error and continue
  }
}

/**
 * Sync metadata activity: Fetches and syncs project metadata (description).
 * On fetch/upsert failure, throws so the Temporal workflow fails.
 */
export async function dustProjectSyncMetadataActivity({
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

  localLogger.info(
    { projectId: configuration.projectId },
    "Fetching and syncing project metadata"
  );

  const dustAPI = getDustAPI(dataSourceConfig, { useInternalAPI: false });
  const metadataResult = await dustAPI.getSpaceMetadata({
    spaceId: configuration.projectId,
  });

  if (metadataResult.isErr()) {
    localLogger.error(
      {
        error: metadataResult.error,
        projectId: configuration.projectId,
      },
      "Failed to fetch project metadata"
    );
    throw new Error(
      `Failed to fetch project metadata: ${metadataResult.error.message}`
    );
  }

  const metadata = metadataResult.value.metadata;

  if (!metadata) {
    localLogger.info(
      { projectId: configuration.projectId },
      "No project metadata from API; skipping metadata upsert"
    );
    return;
  }

  const lastSyncedAtMs = configuration.lastSyncedAt?.getTime();
  if (lastSyncedAtMs !== undefined && metadata.updatedAt < lastSyncedAtMs) {
    localLogger.info(
      {
        projectId: configuration.projectId,
        metadataUpdatedAt: metadata.updatedAt,
        lastSyncedAt: configuration.lastSyncedAt,
      },
      "Skipping project metadata upsert (API metadata older than last full sync)"
    );
    return;
  }

  await syncProjectMetadata({
    dataSourceConfig,
    connectorId,
    projectId: configuration.projectId,
    metadata,
  });

  localLogger.info(
    { projectId: configuration.projectId },
    "Successfully synced project metadata"
  );
}

/**
 * Marks a successful dust_project sync run (conversations + metadata activities).
 * Updates connector sync status via `syncSucceeded` and sets `lastSyncedAt` on the dust project configuration.
 */
export async function dustProjectMarkSyncedActivity({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  const configuration =
    await DustProjectConfigurationResource.fetchByConnectorId(connectorId);
  if (!configuration) {
    throw new Error(`Configuration not found for connector ${connectorId}`);
  }

  await syncSucceeded(connectorId);
  await configuration.update({ lastSyncedAt: new Date() });
}
