import { GongAPIError } from "@connectors/connectors/gong/lib/errors";
import type {
  GongCallTranscript,
  GongTranscriptMetadata,
} from "@connectors/connectors/gong/lib/gong_api";
import { makeGongTranscriptInternalId } from "@connectors/connectors/gong/lib/internal_ids";
import { syncGongTranscript } from "@connectors/connectors/gong/lib/upserts";
import {
  getGongUsers,
  getUserBlobFromGongAPI,
} from "@connectors/connectors/gong/lib/users";
import {
  fetchGongConfiguration,
  fetchGongConnector,
  getGongClient,
} from "@connectors/connectors/gong/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { deleteDataSourceDocument } from "@connectors/lib/data_sources";
import {
  reportInitialSyncProgress,
  syncStarted,
  syncSucceeded,
} from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GongConfigurationResource } from "@connectors/resources/gong_resources";
import {
  GongTranscriptResource,
  GongUserResource,
} from "@connectors/resources/gong_resources";
import type { ModelId } from "@connectors/types";
import { removeNulls } from "@connectors/types/shared/utils/general";
import { Context as ActivityContext } from "@temporalio/activity";

const GARBAGE_COLLECT_BATCH_SIZE = 100;

type PermissionProfileFilter =
  | { type: "unrestricted" }
  | { type: "restricted"; userIds: Set<string> };

async function resolvePermissionProfile(
  connector: ConnectorResource,
  configuration: GongConfigurationResource
): Promise<PermissionProfileFilter> {
  const { permissionProfileId } = configuration;
  if (!permissionProfileId) {
    return { type: "unrestricted" };
  }

  const gongClient = await getGongClient(connector);
  const profile = await gongClient.getPermissionProfile({
    profileId: permissionProfileId,
  });

  if (profile.callsAccess.permissionLevel === "all") {
    return { type: "unrestricted" };
  }

  const { teamLeadIds } = profile.callsAccess;
  if (!teamLeadIds || teamLeadIds.length === 0) {
    return { type: "unrestricted" };
  }

  return { type: "restricted", userIds: new Set(teamLeadIds) };
}

/**
 * Checks if a transcript title contains any excluded keywords.
 */
function shouldExcludeByTitle(
  title: string | undefined,
  excludeKeywords: string[] | null
): boolean {
  if (!excludeKeywords || excludeKeywords.length === 0) {
    return false;
  }
  if (!title) {
    return false;
  }

  const lowerTitle = title.toLowerCase();
  return excludeKeywords.some((kw) => lowerTitle.includes(kw));
  // Note: keywords are already stored lowercase from the resource setter
}

/**
 * Determines whether a transcript should be synced.
 * Excludes private calls. When a permission profile is configured, only syncs
 * calls where at least one participant belongs to the profile's user list.
 */
function shouldSyncTranscript(
  metadata: GongTranscriptMetadata,
  filter: PermissionProfileFilter,
  configuration: GongConfigurationResource
): { shouldSync: false; reason: string } | { shouldSync: true; reason: null } {
  const { excludeTitleKeywords } = configuration;

  if (metadata.metaData.isPrivate) {
    return { shouldSync: false, reason: "transcript is private" };
  }

  if (shouldExcludeByTitle(metadata.metaData.title, excludeTitleKeywords)) {
    return {
      shouldSync: false,
      reason: "title contains excluded keyword",
    };
  }

  if (filter.type === "unrestricted") {
    return { shouldSync: true, reason: null };
  }

  const { parties = [] } = metadata;
  if (parties.some((p) => p.userId && filter.userIds.has(p.userId))) {
    return { shouldSync: true, reason: null };
  }

  return {
    shouldSync: false,
    reason: "no participant matches the permission profile",
  };
}

export async function gongSaveStartSyncActivity({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await fetchGongConnector({ connectorId });

  const result = await syncStarted(connector.id);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function gongSaveSyncSuccessActivity({
  connectorId,
  lastSyncTimestamp,
}: {
  connectorId: ModelId;
  lastSyncTimestamp: number;
}) {
  const connector = await fetchGongConnector({ connectorId });

  const configuration = await fetchGongConfiguration(connector);

  // Update the last sync timestamp.
  await configuration.setLastSyncTimestamp(lastSyncTimestamp);

  const result = await syncSucceeded(connector.id);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function getTranscriptsMetadata({
  callIds,
  connector,
  configuration,
}: {
  callIds: string[];
  connector: ConnectorResource;
  configuration: GongConfigurationResource;
}): Promise<GongTranscriptMetadata[]> {
  const gongClient = await getGongClient(connector);
  const { trackersEnabled, accountsEnabled } = configuration;

  const metadata = [];
  let cursor = null;
  do {
    const { callsMetadata, nextPageCursor } = await gongClient.getCallsMetadata(
      {
        callIds,
        trackersEnabled,
        accountsEnabled,
      }
    );
    metadata.push(...callsMetadata);
    cursor = nextPageCursor;
  } while (cursor);

  return metadata;
}

// Transcripts.
export async function gongSyncTranscriptsActivity({
  connectorId,
  forceResync,
  pageCursor,
  currentRecordCount = 0,
}: {
  forceResync: boolean;
  connectorId: ModelId;
  pageCursor: string | null;
  currentRecordCount?: number;
}) {
  const connector = await fetchGongConnector({ connectorId });
  const configuration = await fetchGongConfiguration(connector);
  const loggerArgs = {
    connectorId: connector.id,
    dataSourceId: connector.dataSourceId,
    provider: "gong",
    startTimestamp: configuration.lastSyncTimestamp,
    workspaceId: connector.workspaceId,
  };

  const gongClient = await getGongClient(connector);

  // Fetch transcripts, handling expired cursor by restarting pagination once.
  let transcriptsResp: {
    transcripts: GongCallTranscript[];
    nextPageCursor: string | null;
    totalRecords: number;
  };
  try {
    transcriptsResp = await gongClient.getTranscripts({
      startTimestamp: configuration.getSyncStartTimestamp(),
      pageCursor,
    });
  } catch (err) {
    const isExpiredCursorError =
      err instanceof GongAPIError &&
      err.status === 400 &&
      Array.isArray(err.errors) &&
      err.errors.some((e) => e.toLowerCase().includes("cursor has expired"));

    if (isExpiredCursorError) {
      logger.warn(
        { ...loggerArgs, pageCursor, requestId: err.requestId },
        "[Gong] Cursor expired; restarting pagination from beginning."
      );
      transcriptsResp = await gongClient.getTranscripts({
        startTimestamp: configuration.getSyncStartTimestamp(),
        pageCursor: null,
      });
    } else {
      throw err;
    }
  }

  const { transcripts, nextPageCursor, totalRecords } = transcriptsResp;

  const processedRecords = transcripts.length;

  if (totalRecords > 0) {
    const progressMessage = `${processedRecords + currentRecordCount}/${totalRecords} transcripts`;
    await reportInitialSyncProgress(connectorId, progressMessage);
  }

  if (transcripts.length === 0) {
    logger.info(
      { ...loggerArgs, pageCursor },
      "[Gong] No more transcripts found."
    );
    return {
      nextPageCursor: null,
      processedRecords,
    };
  }

  const transcriptsInDb = await GongTranscriptResource.fetchByCallIds(
    transcripts.map((t) => t.callId),
    connector
  );
  const transcriptsInDbMap = new Map(transcriptsInDb.map((t) => [t.callId, t]));

  let transcriptsToSync = transcripts;
  if (!forceResync) {
    transcriptsToSync = transcripts.filter(
      (t) => !transcriptsInDbMap.has(t.callId)
    );
  }
  if (transcriptsToSync.length === 0) {
    logger.info({ ...loggerArgs }, "[Gong] All transcripts are already in DB.");
    return {
      nextPageCursor,
      processedRecords,
    };
  }

  const callsMetadata = await getTranscriptsMetadata({
    callIds: transcriptsToSync.map((t) => t.callId),
    connector,
    configuration,
  });
  const callsMetadataMap = new Map(
    callsMetadata.map((c) => [c.metaData.id, c])
  );

  // Consider moving this in a dedicated activity that will be shared across pages.
  const permissionFilter = await resolvePermissionProfile(
    connector,
    configuration
  );

  // Send heartbeat to show progress. If the workflow has been terminated before we start
  // this batch, the activity will fail here. Otherwise, we'll finish processing this batch.
  try {
    const context = ActivityContext.current();
    context.heartbeat();
    await context.sleep(0);
  } catch (err) {
    if (err instanceof Error && err.name === "CancelledFailure") {
      logger.info(
        { ...loggerArgs },
        "[Gong] Activity cancelled before processing transcript batch"
      );
      throw err;
    }
    // Not in Temporal context or other error - continue
  }

  await concurrentExecutor(
    transcriptsToSync,
    async (transcript) => {
      const transcriptMetadata = callsMetadataMap.get(transcript.callId);
      if (!transcriptMetadata) {
        logger.warn(
          { ...loggerArgs, callId: transcript.callId },
          "[Gong] Transcript metadata not found."
        );
        return;
      }

      const { shouldSync, reason } = shouldSyncTranscript(
        transcriptMetadata,
        permissionFilter,
        configuration
      );
      if (!shouldSync) {
        logger.info(
          { ...loggerArgs, callId: transcript.callId, reason },
          `[Gong] Skipping transcript.`
        );
        return;
      }

      const { parties = [] } = transcriptMetadata;

      const participants = await getGongUsers(connector, {
        gongUserIds: parties
          .map((p) => p.userId)
          .filter((id): id is string => Boolean(id)),
      });

      const participantEmails = parties
        .map(
          (party) =>
            participants.find((p) => party.userId === p.gongId)?.email ||
            party.emailAddress
        )
        .filter((email): email is string => Boolean(email));

      const speakerToEmailMap = Object.fromEntries(
        parties.map((party) => [
          party.speakerId,
          // Prefer gong_users table, fallback to metadata email
          participants.find(
            (participant) => participant.gongId === party.userId
          )?.email || party.emailAddress,
        ])
      );

      await syncGongTranscript({
        transcript,
        transcriptMetadata,
        speakerToEmailMap,
        loggerArgs,
        participantEmails,
        connector,
        forceResync,
      });
    },
    { concurrency: 10 }
  );

  // Send heartbeat to show progress after processing the batch
  try {
    const context = ActivityContext.current();
    context.heartbeat();
  } catch (_err) {
    // Not in Temporal context - continue
  }

  return {
    nextPageCursor,
    processedRecords,
  };
}

// Users.
export async function gongListAndSaveUsersActivity({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const connector = await fetchGongConnector({ connectorId });
  const configuration = await fetchGongConfiguration(connector);

  // Skip the full sync of users if we are not on the initial full sync.
  // The call to /users is costly (many users usually) and heavily rate-limited:
  // we have seen retry-after of ~20 minutes.
  if (configuration.lastSyncTimestamp !== null) {
    return;
  }

  const gongClient = await getGongClient(connector);

  let pageCursor = null;
  do {
    const { users, nextPageCursor } = await gongClient.getUsers({
      pageCursor,
    });

    await GongUserResource.batchCreate(
      connector,
      removeNulls(users.map(getUserBlobFromGongAPI))
    );

    pageCursor = nextPageCursor;
  } while (pageCursor);
}

export async function gongCheckGarbageCollectionStateActivity({
  connectorId,
  currentTimestamp,
}: {
  connectorId: ModelId;
  currentTimestamp: number;
}): Promise<{ shouldRunGarbageCollection: boolean }> {
  const connector = await fetchGongConnector({ connectorId });
  const configuration = await fetchGongConfiguration(connector);

  return configuration.checkGarbageCollectionState({
    currentTimestamp,
  });
}

export async function gongSaveGarbageCollectionSuccessActivity({
  connectorId,
  lastGarbageCollectionTimestamp,
}: {
  connectorId: ModelId;
  lastGarbageCollectionTimestamp: number;
}) {
  const connector = await fetchGongConnector({ connectorId });
  const configuration = await fetchGongConfiguration(connector);

  // Update the last garbage collection timestamp.
  await configuration.setLastGarbageCollectionTimestamp(
    lastGarbageCollectionTimestamp
  );
}

export async function gongDeleteOutdatedTranscriptsActivity({
  connectorId,
  garbageCollectionStartTs,
}: {
  connectorId: ModelId;
  garbageCollectionStartTs: number;
}): Promise<{ hasMore: boolean }> {
  const connector = await fetchGongConnector({ connectorId });
  const configuration = await fetchGongConfiguration(connector);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const outdatedTranscripts = await GongTranscriptResource.fetchOutdated(
    connector,
    configuration,
    {
      garbageCollectionStartTs,
      limit: GARBAGE_COLLECT_BATCH_SIZE,
    }
  );

  // Delete the data from core.
  for (const transcript of outdatedTranscripts) {
    await deleteDataSourceDocument(
      dataSourceConfig,
      makeGongTranscriptInternalId(connector, transcript.callId),
      {
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        provider: "gong",
        callId: transcript.callId,
      }
    );
  }

  // Delete the data from connectors.
  await GongTranscriptResource.batchDelete(connector, outdatedTranscripts);

  return {
    hasMore: outdatedTranscripts.length === GARBAGE_COLLECT_BATCH_SIZE,
  };
}

/**
 * Activity to delete transcripts matching newly added exclude keywords.
 * Uses application-level filtering with shouldExcludeByTitle() for consistency
 * with sync-time filtering logic. Uses cursor-based pagination to efficiently
 * process transcripts in batches without re-processing.
 */
export async function gongDeleteExcludedTranscriptsActivity({
  connectorId,
  excludeKeywords,
  lastId,
}: {
  connectorId: ModelId;
  excludeKeywords: string[];
  lastId?: number;
}): Promise<{ hasMore: boolean; lastId: number | null }> {
  const connector = await fetchGongConnector({ connectorId });
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  // Fetch a batch of transcripts using cursor-based pagination
  const transcripts = await GongTranscriptResource.fetchBatch(connector, {
    limit: GARBAGE_COLLECT_BATCH_SIZE,
    lastId,
  });

  if (transcripts.length === 0) {
    logger.info(
      { connectorId: connector.id, provider: "gong" },
      "[Gong] Cleanup: No more transcripts to process"
    );
    return { hasMore: false, lastId: null };
  }

  logger.info(
    {
      connectorId: connector.id,
      provider: "gong",
      batchSize: transcripts.length,
      lastId,
      excludeKeywords,
    },
    "[Gong] Cleanup: Processing batch of transcripts"
  );

  // Filter using the same logic as sync-time filtering
  const transcriptsToDelete = transcripts.filter((transcript) => {
    const shouldDelete = shouldExcludeByTitle(
      transcript.title,
      excludeKeywords
    );
    logger.info(
      {
        connectorId: connector.id,
        provider: "gong",
        callId: transcript.callId,
        title: transcript.title,
        shouldDelete,
        excludeKeywords,
      },
      `[Gong] Cleanup: Evaluated transcript - ${shouldDelete ? "WILL DELETE" : "keeping"}`
    );
    return shouldDelete;
  });

  logger.info(
    {
      connectorId: connector.id,
      provider: "gong",
      totalEvaluated: transcripts.length,
      toDelete: transcriptsToDelete.length,
      toKeep: transcripts.length - transcriptsToDelete.length,
    },
    "[Gong] Cleanup: Batch evaluation complete"
  );

  // Delete from Core data source first
  for (const transcript of transcriptsToDelete) {
    logger.info(
      {
        connectorId: connector.id,
        provider: "gong",
        callId: transcript.callId,
        title: transcript.title,
      },
      "[Gong] Cleanup: Deleting transcript"
    );

    await deleteDataSourceDocument(
      dataSourceConfig,
      makeGongTranscriptInternalId(connector, transcript.callId),
      {
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        provider: "gong",
        callId: transcript.callId,
      }
    );
  }

  // Then delete from connectors DB
  await GongTranscriptResource.batchDelete(connector, transcriptsToDelete);

  logger.info(
    {
      connectorId: connector.id,
      provider: "gong",
      deletedCount: transcriptsToDelete.length,
    },
    "[Gong] Cleanup: Batch deletion complete"
  );

  // Get the last ID from the batch for cursor-based pagination
  // Safe access since we already checked transcripts.length > 0
  const lastTranscript = transcripts[transcripts.length - 1];
  const newLastId = lastTranscript ? lastTranscript.id : null;
  const hasMore = transcripts.length === GARBAGE_COLLECT_BATCH_SIZE;

  return {
    hasMore,
    lastId: newLastId,
  };
}
