import type { drive_v3 } from "googleapis";
import * as googleapis from "googleapis";
import { resetExtensions } from "showdown";

import { SolutionsTranscriptsConfiguration } from "@app/lib/models/solutions";
import { launchSummarizeTranscriptWorkflow } from "@app/lib/solutions/transcripts/temporal/client";
import { getGoogleAuth } from "@app/lib/solutions/transcripts/utils/helpers";
import mainLogger from "@app/logger/logger";

const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID } = process.env;

export async function retrieveNewTranscriptsActivity(
  userId: number,
  providerId: string
) {
  const logger = mainLogger.child({ userId });

  if (providerId == "google_drive") {
    const auth = await getGoogleAuth(userId)

    // Only pull transcripts from the last month
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 31);
    cutoffDate.setHours(0, 0, 0, 0);

    // GET LAST TRANSCRIPTS
    const files = await googleapis.google.drive({ version: "v3", auth }).files.list({
      q: "name contains '- Transcript' and createdTime > '" + cutoffDate.toISOString() +"'",
      fields: "files(id, name)",
    });

    console.log(files.data.files);
    
    if(!files.data.files) {
      logger.info("[retrieveNewTranscripts] No new files found");
      return;
    }
    
    files.data.files.forEach(async (file: drive_v3.Schema$File) => {
      const fileId = file.id as string;
      await launchSummarizeTranscriptWorkflow({userId, fileId});
    });
  }

  logger.info({}, "[retrieveNewTranscripts] Successful run retrieveNewTranscriptsActivity");
}


export async function summarizeGoogleDriveTranscriptActivity(
  userId: number,
  fileId: string
) {
    const logger = mainLogger.child({ userId });
    const providerId = "google_drive";
    if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
      throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not set");
    }
    logger.info("[summarizeGoogleDriveTranscriptActivity] Starting summarization of file ", fileId);

    const transcriptsConfiguration = await SolutionsTranscriptsConfiguration.findOne({
      attributes: ["id", "connectionId", "provider"],
      where: {
        userId: userId, 
        provider: providerId,
      },
    })

    if (!transcriptsConfiguration) {
      logger.info({}, "[summarizeGoogleDriveTranscriptActivity] No configuration found. Stopping.");
      return;
    }

    const auth = await getGoogleAuth(userId)

    console.log('GETTING TRANSCRIPT CONTENT FROM GDRIVE');
    
    // Get fileId file content
    const res = await googleapis.google.drive({ version: 'v3', auth }).files.export({
      fileId: fileId,
      mimeType: "text/plain",
    });

    if (res.status !== 200) {
      logger.error({}, "Error exporting Google document");
      throw new Error(
        `Error exporting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }
    
    const transcriptContent = res.data;    

    console.log('GOT TRANSCRIPT CONTENT');
    console.log(transcriptContent);
  }
