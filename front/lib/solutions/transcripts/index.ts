import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import { getConnectionFromNango } from "../utils/helpers";
import type { NangoConnectionResponse } from "../utils/types";

// SOLUTIONS CAN BE REMOVED AT ANY TIME, SO DEFINING TYPES DIRECTLY IN THE FILE TO AVOID IMPORTING FROM FRONT};



export async function getAuthObject(
  nangoConnectionId: string
): Promise<OAuth2Client> {
  const res: NangoConnectionResponse = await getConnectionFromNango({
    connectionId: nangoConnectionId,
    integrationId: googleDriveConfig.getRequiredNangoGoogleDriveConnectorId(),
    refreshToken: false
  });

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: res.credentials.access_token,
    scope: res.credentials.raw.scope,
    token_type: res.credentials.raw.token_type,
    expiry_date: new Date(res.credentials.expires_at).getTime(),
  });

  return oauth2Client;
}