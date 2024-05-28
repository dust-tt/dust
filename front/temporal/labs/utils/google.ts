import type { ModelId } from "@dust-tt/types";
import { google } from "googleapis";

import type { Authenticator } from "@app/lib/auth";
import { getTranscriptsGoogleAuth } from "@app/lib/labs/transcripts/utils/helpers";
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
  const googleAuth = await getTranscriptsGoogleAuth(auth, userId);

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

  const files = await google
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

export async function retrieveGoogleTranscripts(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  localLogger: Logger
): Promise<string[]> {
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

export async function retrieveGoogleTranscriptContent(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  fileId: string,
  localLogger: Logger
): Promise<{ transcriptTitle: string; transcriptContent: string }> {
  const googleAuth = await getTranscriptsGoogleAuth(
    auth,
    transcriptsConfiguration.userId
  );
  const drive = google.drive({ version: "v3", auth: googleAuth });

  const metadataRes = await drive.files.get({
    fileId: fileId,
    fields: "name",
  });

  try {
    const contentRes = await drive.files.export({
      fileId: fileId,
      mimeType: "text/plain",
    });

    if (contentRes.status !== 200) {
      localLogger.error(
        { error: contentRes.statusText },
        "Error exporting Google document."
      );

      throw new Error(
        `Error exporting Google document. status_code: ${contentRes.status}. status_text: ${contentRes.statusText}`
      );
    }
    const transcriptTitle = metadataRes.data.name || "Untitled";
    const transcriptContent = <string>contentRes.data;

    return { transcriptTitle, transcriptContent };
  } catch (error) {
    localLogger.error({ fileId }, "Error exporting Google document. Skipping.");
    return { transcriptTitle: "", transcriptContent: "" };
  }
}
