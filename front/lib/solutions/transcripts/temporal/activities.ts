// import type { drive_v3 } from "googleapis";
import { google } from "googleapis";

import { SolutionsTranscriptsConfiguration } from "@app/lib/models/solutions";
import { getGoogleAuthObject } from "@app/lib/solutions/transcripts/utils/helpers";
import mainLogger from "@app/logger/logger";

const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID } = process.env;

export async function retrieveNewTranscriptsActivity(
  userId: number,
  providerId: string
) {
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not set");
  }

  const logger = mainLogger.child({ userId });
  logger.info("[retrieveNewTranscripts] Retrieving SolutionsTranscriptsConfiguration");

  const transcriptsConfiguration = await SolutionsTranscriptsConfiguration.findOne({
    attributes: ["id", "connectionId", "provider"],
    where: {
      userId: userId, 
      provider: providerId,
    },
  })

  if (!transcriptsConfiguration) {
    logger.info({}, "[retrieveNewTranscripts] No configuration found. Stopping.");
    return;
  }

  if (providerId == "google_drive") {
    const auth = await getGoogleAuthObject(NANGO_GOOGLE_DRIVE_CONNECTOR_ID as string, transcriptsConfiguration.connectionId)
    console.log('ACCESS TOKEN', auth.credentials.access_token)

    // list google drive files here that start with "Transcript -"
    const files = await google.drive({ version: "v3", auth }).files.list({
      q: "name contains '- Transcript'",
      fields: "files(id, name)",
    });

    console.log(files.data.files);
  }

  logger.info({}, "[retrieveNewTranscripts] Successful run retrieveNewTranscriptsActivity");
}
