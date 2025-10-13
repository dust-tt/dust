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

const GARBAGE_COLLECT_BATCH_SIZE = 100;

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
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    connectorId: connector.id,
    dataSourceId: dataSourceConfig.dataSourceId,
    provider: "gong",
    startTimestamp: configuration.lastSyncTimestamp,
    workspaceId: dataSourceConfig.workspaceId,
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
    const progressMessage = `${processedRecords + currentRecordCount + 1}/${totalRecords} transcripts`;
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
        dataSourceConfig,
        speakerToEmailMap,
        loggerArgs,
        participantEmails,
        connector,
        forceResync,
      });
    },
    { concurrency: 10 }
  );

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
