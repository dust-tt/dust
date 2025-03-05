import { MIME_TYPES } from "@dust-tt/types";

import type {
  GongCallTranscript,
  GongParticipant,
  GongTranscriptMetadata,
} from "@connectors/connectors/gong/lib/gong_api";
import {
  makeGongTranscriptFolderInternalId,
  makeGongTranscriptInternalId,
} from "@connectors/connectors/gong/lib/internal_ids";
import {
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { GongTranscriptResource } from "@connectors/resources/gong_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * Syncs a transcript in the db and upserts it to the data sources.
 */
export async function syncGongTranscript({
  transcript,
  transcriptMetadata,
  speakers,
  connector,
  dataSourceConfig,
  loggerArgs,
  forceResync,
}: {
  transcript: GongCallTranscript;
  transcriptMetadata: GongTranscriptMetadata;
  speakers: Record<string, GongParticipant>;
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number | null>;
  forceResync: boolean;
}) {
  const { callId } = transcript;
  const createdAtDate = new Date(transcriptMetadata.metaData.started);
  const title = transcriptMetadata.metaData.title || "Untitled transcript";
  const documentUrl = transcriptMetadata.metaData.url;

  const transcriptInDb = await GongTranscriptResource.fetchByCallId(
    callId,
    connector
  );

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

  if (!transcriptInDb) {
    await GongTranscriptResource.makeNew({
      blob: {
        connectorId: connector.id,
        callId,
        title,
        url: documentUrl,
      },
    });
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

  const tags = [
    transcriptMetadata.metaData.language,
    transcriptMetadata.metaData.media,
    transcriptMetadata.metaData.isPrivate ? "private" : "public",
    transcriptMetadata.metaData.scope,
    ...new Set(
      transcript.transcript.map(
        (monologue) =>
          speakers[monologue.speakerId]?.emailAddress || "Unknown speaker"
      )
    ),
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

  const documentId = makeGongTranscriptInternalId(connector, callId);

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
    documentUrl,
    timestampMs: createdAtDate.getTime(),
    tags: [`title:${title}`, `createdAt:${createdAtDate.getTime()}`, ...tags],
    parents: [documentId, makeGongTranscriptFolderInternalId(connector)],
    parentId: makeGongTranscriptFolderInternalId(connector),
    loggerArgs: { ...loggerArgs, callId },
    upsertContext: { sync_type: "batch" },
    title,
    mimeType: MIME_TYPES.GONG.TRANSCRIPT,
    async: true,
  });
}
