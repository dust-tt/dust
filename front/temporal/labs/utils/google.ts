import type { ModelId } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { getGoogleAuthFromUserTranscriptsConfiguration } from "@app/lib/labs/transcripts/utils/helpers";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";

export async function retrieveRecentGoogleTranscripts(
  {
    auth,
    userId,
  }: {
    auth: Authenticator;
    userId: ModelId;
  },
  logger: Logger
) {
  const googleAuth = await getGoogleAuthFromUserTranscriptsConfiguration(
    auth,
    userId
  );

  if (!googleAuth) {
    logger.error(
      {},
      "[retrieveRecentGoogleTranscripts] No Google auth found. Stopping."
    );
    return [];
  }

  // Only pull transcripts from last day.
  // We could do from the last 15 minutes
  // but we want to avoid missing any if the workflow is down or slow.
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 1);

  const files = await googleapis.google
    .drive({ version: "v3", auth: googleAuth })
    .files.list({
      q:
        "name contains '- Transcript' and createdTime > '" +
        cutoffDate.toISOString() +
        "'",
      fields: "files(id, name)",
    });

  const { files: filesData } = files.data;
  if (!filesData || filesData.length === 0) {
    logger.info({}, "[retrieveRecentGoogleTranscripts] No new files found.");
    return [];
  }

  return filesData;
}


export async function retrieveGoogleTranscripts(auth: Authenticator, transcriptsConfiguration: LabsTranscriptsConfigurationResource, localLogger: Logger): Promise<string[]> {
  const fileIdsToProcess = [];
  const recentTranscriptFiles = await retrieveRecentGoogleTranscripts(
    {
      auth,
      userId: transcriptsConfiguration.userId,
    },
    localLogger
  );

  for (const recentTranscriptFile of recentTranscriptFiles) {
    const { id: fileId } = recentTranscriptFile;
    if (!fileId) {
      localLogger.error(
        {},
        "[retrieveNewTranscripts] File does not have an id. Skipping."
      );
      continue;
    }

    const history = await transcriptsConfiguration.fetchHistoryForFileId(
      fileId
    );
    if (history) {
      localLogger.info(
        { fileId },
        "[retrieveNewTranscripts] File already processed. Skipping."
      );
      continue;
    }

    fileIdsToProcess.push(fileId);
  }
  return fileIdsToProcess;
}