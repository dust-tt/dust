import type {
  ModelId,
  NangoConnectionId,
  NangoIntegrationId,
} from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import type { Authenticator } from "@app/lib/auth";
import config from "@app/lib/labs/config";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";

const nango = new Nango({ secretKey: config.getNangoSecretKey() });

// Google Auth
export async function getGoogleAuthObject(
  nangoIntegrationId: NangoIntegrationId,
  nangoConnectionId: NangoConnectionId
): Promise<OAuth2Client> {
  const res = await nango.getConnection(nangoIntegrationId, nangoConnectionId);

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: res.credentials.raw.access_token,
    scope: res.credentials.raw.scope,
    token_type: res.credentials.raw.token_type,
    expiry_date: new Date(res.credentials.raw.expires_at).getTime(),
  });

  return oauth2Client;
}

export async function getTranscriptsGoogleAuth(
  auth: Authenticator,
  userId: ModelId
) {
  const transcriptsConfiguration =
    await LabsTranscriptsConfigurationResource.findByUserAndWorkspace({
      auth,
      userId,
    });

  if (
    !transcriptsConfiguration ||
    transcriptsConfiguration.connectionId === null ||
    transcriptsConfiguration.provider !== "google_drive"
  ) {
    return;
  }

  return getGoogleAuthObject(
    config.getNangoGoogleDriveConnectorId(),
    transcriptsConfiguration.connectionId
  );
}

export async function getAccessTokenFromNango(
  nangoIntegrationId: NangoIntegrationId,
  nangoConnectionId: NangoConnectionId
): Promise<string> {
  const res = await nango.getConnection(nangoIntegrationId, nangoConnectionId);

  return res.credentials.raw.access_token;
}
