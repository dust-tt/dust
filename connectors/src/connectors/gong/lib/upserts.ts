import { MIME_TYPES } from "@dust-tt/types";

import type {
  GongCallTranscript,
  GongParticipant,
  GongTranscriptMetadata,
} from "@connectors/connectors/gong/lib/gong_api";
import {
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GongConfigurationResource } from "@connectors/resources/gong_resources";
import { GongTranscriptResource } from "@connectors/resources/gong_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export function shouldSyncTranscript(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  transcript: GongCallTranscript,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  configuration: GongConfigurationResource
): boolean {
  // TODO(2025-03-05): Implement this function based on permissions logic.
  return true;
}

function makeTranscriptInternalId(
  connector: ConnectorResource,
  callId: string
) {
  return `gong-transcript-${connector.id}-${callId}`;
}

/**
 * Syncs a transcript in the db and upserts it to the data sources.
 */
export async function syncTranscript(
  connector: ConnectorResource,
  configuration: GongConfigurationResource,
  transcript: GongCallTranscript,
  transcriptMetadata: GongTranscriptMetadata,
  speakers: Record<string, GongParticipant>,
  {
    dataSourceConfig,
    loggerArgs,
    forceResync,
  }: {
    dataSourceConfig: DataSourceConfig;
    loggerArgs: Record<string, string | number | null>;
    forceResync: boolean;
  }
) {
  const { callId } = transcript;
  const createdAtDate = new Date(transcriptMetadata.metaData.started);

  const transcriptInDb = await GongTranscriptResource.fetchByCallId(
    callId,
    connector
  );

  if (!transcriptInDb) {
    await GongTranscriptResource.makeNew({
      blob: { callId },
    });
  } else {
    await transcriptInDb.update({});
  }

  if (!forceResync && transcriptInDb) {
    logger.info(
      {
        ...loggerArgs,
        callId,
      },
      "[Gong] Transcript already up to date, skipping sync."
    );
    return;
  }

  logger.info(
    {
      ...loggerArgs,
      callId,
      createdAtDate,
    },
    "[Gong] Upserting transcript."
  );

  const hours = Math.floor(transcriptMetadata.metaData.duration / 3600);
  const minutes = Math.floor(
    (transcriptMetadata.metaData.duration % 3600) / 60
  );
  const callDuration = `${hours} hours ${minutes < 10 ? "0" + minutes : minutes} minutes`;

  const title = transcriptMetadata.metaData.title || "Untitled transcript";
  const tags = [
    transcriptMetadata.metaData.language,
    transcriptMetadata.metaData.media,
    transcriptMetadata.metaData.isPrivate ? "private" : "public",
    transcriptMetadata.metaData.scope,
  ];
  let documentContent = `Meeting title: ${title}\n\nDate: ${createdAtDate.toISOString()}\n\nDuration: ${callDuration}\n\n`;

  // Rebuild the transcript content with [User]: [sentence].
  transcript.transcript.forEach((monologue) => {
    let lastSpeakerId: string | null = null;
    monologue.sentences.forEach((sentence) => {
      if (monologue.speakerId !== lastSpeakerId) {
        documentContent += `# ${speakers[monologue.speakerId] || "Unknown speaker"}: `;
        lastSpeakerId = monologue.speakerId;
      }
      documentContent += `${sentence.text}\n`;
    });
  });

  const documentId = makeTranscriptInternalId(connector, callId);

  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent: await renderDocumentTitleAndContent({
      dataSourceConfig,
      title,
      content: await renderMarkdownSection(dataSourceConfig, documentContent),
      createdAt: createdAtDate,
      additionalPrefixes: {
        labels: tags.join(", ") || "none",
      },
    }),
    documentUrl: transcriptMetadata.metaData.url,
    timestampMs: createdAtDate.getTime(),
    tags: [`title:${title}`, `createdAt:${createdAtDate.getTime()}`, ...tags],
    parents: [documentId],
    parentId: null,
    loggerArgs: { ...loggerArgs, callId },
    upsertContext: { sync_type: "batch" },
    title,
    mimeType: MIME_TYPES.GONG.TRANSCRIPT,
    async: true,
  });
}
