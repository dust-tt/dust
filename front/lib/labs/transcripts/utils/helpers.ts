import type { ModelId } from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import type { Connection } from "@nangohq/node/dist/types";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_configuration_resource";

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY as string });
const { NANGO_GOOGLE_DRIVE_CONNECTOR_ID } = process.env;

// Google Auth
export async function getGoogleAuthObject(
  nangoIntegrationId: string,
  nangoConnectionId: string
): Promise<OAuth2Client> {
  const res: Connection = await nango.getConnection(
    nangoIntegrationId,
    nangoConnectionId
  );

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: res.credentials.raw.access_token,
    scope: res.credentials.raw.scope,
    token_type: res.credentials.raw.token_type,
    expiry_date: new Date(res.credentials.raw.expires_at).getTime(),
  });

  return oauth2Client;
}

export async function getGoogleAuthFromUserTranscriptConfiguration(
  userId: ModelId
) {
  const providerId = "google_drive";
  if (!NANGO_GOOGLE_DRIVE_CONNECTOR_ID) {
    throw new Error("NANGO_GOOGLE_DRIVE_CONNECTOR_ID is not set");
  }

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserIdAndProvider({
      userId: userId,
      provider: providerId,
    });

  if (!transcriptsConfiguration) {
    return;
  }

  return getGoogleAuthObject(
    NANGO_GOOGLE_DRIVE_CONNECTOR_ID as string,
    transcriptsConfiguration.connectionId
  );
}
