
import { Nango } from "@nangohq/node";
import type { Connection } from "@nangohq/node/dist/types";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY as string });

// NANGO 
export async function getAuthObject(
  integrationId: string,
  nangoConnectionId: string
): Promise<OAuth2Client> {
  const res: Connection = await nango.getConnection(
    integrationId,
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
// END NANGO
