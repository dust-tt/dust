import type {
  ModelId,
  NangoIntegrationId,
  OAuthProvider,
  Result,
} from "@dust-tt/types";
import { Err, getOAuthConnectionAccessToken, Ok } from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import { google } from "googleapis";

import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import config from "@app/lib/labs/config";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";

const nango = new Nango({ secretKey: config.getNangoSecretKey() });

export function isDualUseOAuthConnectionId(connectionId: string): boolean {
  // TODO(spolu): make sure this function is removed once fully migrated.
  return connectionId.startsWith("con_");
}

// Google Auth
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

  const connectionId = transcriptsConfiguration.connectionId;
  const provider: OAuthProvider = "google_drive";

  const oauth2Client = new google.auth.OAuth2();

  if (isDualUseOAuthConnectionId(connectionId)) {
    const tokRes = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      provider,
      connectionId,
    });

    if (tokRes.isErr()) {
      logger.error(
        { connectionId, error: tokRes.error, provider },
        "Error retrieving access token"
      );
      throw new Error(`Error retrieving access token from ${provider}`);
    }

    oauth2Client.setCredentials({
      access_token: tokRes.value.access_token,
      scope: (tokRes.value.scrubbed_raw_json as { scope: string }).scope,
      token_type: (tokRes.value.scrubbed_raw_json as { token_type: string })
        .token_type,
      expiry_date: tokRes.value.access_token_expiry,
    });
  } else {
    const res = await nango.getConnection(
      config.getNangoConnectorIdForProvider("google_drive"),
      connectionId
    );

    oauth2Client.setCredentials({
      access_token: res.credentials.raw.access_token,
      scope: res.credentials.raw.scope,
      token_type: res.credentials.raw.token_type,
      expiry_date: new Date(res.credentials.raw.expires_at).getTime(),
    });
  }

  return oauth2Client;
}

export async function getAccessTokenFromNango(
  nangoIntegrationId: NangoIntegrationId,
  nangoConnectionId: string
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
