import { google } from "googleapis";

import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import { stopRetrieveTranscriptsWorkflow } from "@app/temporal/labs/client";
import type { ModelId, OAuthProvider } from "@app/types";
import { getOAuthConnectionAccessToken } from "@app/types";

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
    await stopRetrieveTranscriptsWorkflow(transcriptsConfiguration);
    throw new Error(`Error retrieving access token from ${provider}`);
  }

  oauth2Client.setCredentials({
    access_token: tokRes.value.access_token,
    scope: (tokRes.value.scrubbed_raw_json as { scope: string }).scope,
    token_type: (tokRes.value.scrubbed_raw_json as { token_type: string })
      .token_type,
    expiry_date: tokRes.value.access_token_expiry,
  });

  return oauth2Client;
}
