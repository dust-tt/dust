import type { ModelId } from "@dust-tt/types";

import type { GongTranscriptMetadata } from "@connectors/connectors/gong/lib/gong_api";
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
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
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

async function getTranscriptsMetadata({
  callIds,
  connector,
}: {
  callIds: string[];
  connector: ConnectorResource;
}): Promise<GongTranscriptMetadata[]> {
  const gongClient = await getGongClient(connector);

  const metadata = [];
  let cursor = null;
  do {
    const { callsMetadata, nextPageCursor } = await gongClient.getCallsMetadata(
      {
        callIds,
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
    const callsMetadata = await getTranscriptsMetadata({
      callIds: transcripts.map((t) => t.callId),
      connector,
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
        const participants = await getGongUsers(connector, {
          gongUserIds: transcriptMetadata.parties
            .map((p) => p.userId)
            .filter((id): id is string => Boolean(id)),
        });

        const participantEmails = transcriptMetadata.parties
          .map(
            (party) =>
              participants.find((p) => party.userId === p.gongId)?.email ||
              party.emailAddress
          )
          .filter((email): email is string => Boolean(email));

        const speakerToEmailMap = Object.fromEntries(
          transcriptMetadata.parties.map((party) => [
            party.speakerId,
            // Use the table gong_users as the main ground truth, fallback to email address in the metadata.
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
