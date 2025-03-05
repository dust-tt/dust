import type { ModelId } from "@dust-tt/types";

import { syncGongTranscript } from "@connectors/connectors/gong/lib/upserts";
import { getUserBlobFromGongAPI } from "@connectors/connectors/gong/lib/users";
import {
  fetchGongConfiguration,
  fetchGongConnector,
  getGongClient,
} from "@connectors/connectors/gong/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { GongUserResource } from "@connectors/resources/gong_resources";

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
}: {
  connectorId: ModelId;
}) {
  const connector = await fetchGongConnector({ connectorId });

  const result = await syncSucceeded(connector.id);
  if (result.isErr()) {
    throw result.error;
  }
}

// Transcripts.
export async function gongSyncTranscriptsActivity({
  connectorId,
  forceResync,
}: {
  forceResync: boolean;
  connectorId: ModelId;
}) {
  const connector = await fetchGongConnector({ connectorId });
  const configuration = await fetchGongConfiguration(connector);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceId: dataSourceConfig.dataSourceId,
    provider: "gong",
  };

  const syncStartTs = Date.now();

  const gongClient = await getGongClient(connector);

  let pageCursor = null;
  do {
    const { transcripts, nextPageCursor } = await gongClient.getTranscripts({
      startTimestamp: configuration.lastSyncTimestamp,
      pageCursor,
    });
    // TODO(2025-03-05): exhaust the cursor here instead of doing only 1 call.
    const { callsMetadata } = await gongClient.getCallsMetadata({
      callIds: transcripts.map((t) => t.callId),
    });
    await concurrentExecutor(
      transcripts,
      async (transcript) => {
        const transcriptMetadata = callsMetadata.find(
          (c) => c.metaData.id === transcript.callId
        );
        if (!transcriptMetadata) {
          logger.warn(
            { ...loggerArgs, callId: transcript.callId },
            "[Gong] Transcript metadata not found."
          );
          return;
        }
        await syncGongTranscript({
          transcript,
          transcriptMetadata,
          dataSourceConfig,
          loggerArgs,
          // TODO: this is a mock, we have to fill this and make sure we have all the speakers.
          participants: {},
          connector,
          forceResync,
        });
      },
      { concurrency: 10 }
    );

    pageCursor = nextPageCursor;
  } while (pageCursor);

  await configuration.setLastSyncTimestamp(syncStartTs);
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
      users.map(getUserBlobFromGongAPI)
    );

    pageCursor = nextPageCursor;
  } while (pageCursor);
}
