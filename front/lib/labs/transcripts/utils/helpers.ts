import type {
  ModelId,
  NangoConnectionId,
  NangoIntegrationId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import type { Authenticator } from "@app/lib/auth";
import config from "@app/lib/labs/config";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";

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
    config.getNangoConnectorIdForProvider("google_drive"),
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

export async function nangoDeleteConnection(
  connectionId: string,
  providerConfigKey: string
): Promise<Result<undefined, Error>> {
  const url = `${nango.serverUrl}/connection/${connectionId}?provider_config_key=${providerConfigKey}`;
  const headers = {
    "Content-Type": "application/json",
    "Accept-Encoding": "application/json",
    Authorization: `Bearer ${nango.secretKey}`,
  };
  const res = await fetch(url, {
    method: "DELETE",
    headers,
  });
  if (res.ok) {
    return new Ok(undefined);
  } else {
    logger.error({ connectionId }, "Could not delete Nango connection.");
    if (res) {
      if (res.status === 404) {
        logger.error({ connectionId }, "Connection not found on Nango.");
        return new Ok(undefined);
      }

      return new Err(
        new Error(
          `Could not delete connection. ${res.statusText}, ${await res.text()}`
        )
      );
    }

    return new Err(new Error(`Could not delete connection.`));
  }
}
