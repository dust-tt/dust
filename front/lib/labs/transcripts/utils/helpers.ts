import type { ModelId } from "@dust-tt/types";
import type { NangoConnectionId, NangoIntegrationId } from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import type { Connection } from "@nangohq/node/dist/types";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import config from "@app/lib/labs/config";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";

const nango = new Nango({ secretKey: config.getNangoSecretKey() });

// Google Auth
export async function getGoogleAuthObject(
  nangoIntegrationId: NangoIntegrationId,
  nangoConnectionId: NangoConnectionId
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
  userId: ModelId,
  workspaceId: ModelId
) {
  const providerId = "google_drive";

  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserWorkspaceAndProvider({
      userId,
      workspaceId,
      provider: providerId,
    });

  if (!transcriptsConfiguration) {
    return;
  }

  return getGoogleAuthObject(
    config.getNangoGoogleDriveConnectorId(),
    transcriptsConfiguration.connectionId
  );
}
