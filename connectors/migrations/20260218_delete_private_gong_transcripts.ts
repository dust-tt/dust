import { makeGongTranscriptInternalId } from "@connectors/connectors/gong/lib/internal_ids";
import {
  fetchGongConfiguration,
  fetchGongConnector,
  getGongClient,
} from "@connectors/connectors/gong/lib/utils";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { deleteDataSourceDocument } from "@connectors/lib/data_sources";
import { GongTranscriptModel } from "@connectors/lib/models/gong";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";
import type { Logger } from "pino";

const BATCH_SIZE = 100;
const DELETION_CONCURRENCY = 10;

async function deletePrivateTranscripts(
  connectorId: number,
  {
    execute,
    logger: parentLogger,
  }: {
    execute: boolean;
    logger: Logger;
  }
) {
  const logger = parentLogger.child({ connectorId });

  const connector = await fetchGongConnector({ connectorId });
  const configuration = await fetchGongConfiguration(connector);
  const gongClient = await getGongClient(connector);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  let nextId: number | undefined = 0;
  let totalChecked = 0;
  let totalPrivate = 0;
  let hasMore = true;

  do {
    // Using the model directly for pagination.
    const transcripts: GongTranscriptModel[] =
      await GongTranscriptModel.findAll({
        where: {
          connectorId,
          id: { [Op.gt]: nextId },
        },
        limit: BATCH_SIZE,
        order: [["id", "ASC"]],
      });

    if (transcripts.length === 0) {
      break;
    }

    const callIds = transcripts.map((t) => t.callId);
    const callMetadataMap = new Map<string, { isPrivate: boolean }>();

    let cursor = null;
    do {
      const { callsMetadata, nextPageCursor } =
        await gongClient.getCallsMetadata({
          callIds,
          trackersEnabled: configuration.trackersEnabled,
          accountsEnabled: configuration.accountsEnabled,
          pageCursor: cursor,
        });
      for (const meta of callsMetadata) {
        callMetadataMap.set(meta.metaData.id, {
          isPrivate: meta.metaData.isPrivate === true,
        });
      }
      cursor = nextPageCursor;
    } while (cursor);

    const privateTranscripts = transcripts.filter(
      (t) => callMetadataMap.get(t.callId)?.isPrivate === true
    );

    totalChecked += transcripts.length;
    totalPrivate += privateTranscripts.length;

    logger.info(
      {
        batch: transcripts.length,
        privateInBatch: privateTranscripts.length,
        totalChecked,
        totalPrivate,
      },
      "Processed batch."
    );

    if (privateTranscripts.length > 0 && execute) {
      // Delete from core.
      await concurrentExecutor(
        privateTranscripts,
        async (transcript) => {
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
        },
        { concurrency: DELETION_CONCURRENCY }
      );

      // Delete from connectors DB.
      await GongTranscriptModel.destroy({
        where: {
          callId: privateTranscripts.map((t) => t.callId),
          connectorId: connector.id,
        },
      });
    }

    nextId = transcripts[transcripts.length - 1]?.id;
    hasMore = transcripts.length < BATCH_SIZE;
  } while (hasMore);

  logger.info({ totalChecked, totalPrivate, execute }, "Done.");
}

makeScript(
  { connectorId: { type: "number", required: true } },
  async ({ connectorId, execute }, logger) => {
    await deletePrivateTranscripts(connectorId, { execute, logger });
  }
);
