import axios from "axios";
import { OAuth2Client } from "googleapis-common";
import { v4 as uuidv4 } from "uuid";

import { HTTPError } from "@connectors/lib/error";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import logger from "@connectors/logger/logger";

import { getAuthObject } from "./temporal/activities";
const { CONNECTORS_PUBLIC_URL, DUST_CONNECTORS_WEBHOOKS_SECRET } = process.env;

export async function registerWebhook(
  nangoConnectionId: string
): Promise<
  Result<{ id: string; expirationTsMs: number; url: string }, HTTPError | Error>
> {
  if (!DUST_CONNECTORS_WEBHOOKS_SECRET) {
    return new Err(new Error("DUST_CONNECTORS_WEBHOOKS_SECRET is not defined"));
  }
  if (!CONNECTORS_PUBLIC_URL) {
    return new Err(new Error("CONNECTORS_PUBLIC_URL is not defined"));
  }
  let auth: OAuth2Client | undefined = undefined;
  try {
    auth = await getAuthObject(nangoConnectionId);
  } catch (e) {
    logger.error(
      { error: e, typeoferror: typeof e },
      `Failed to get auth object for ${nangoConnectionId}`
    );
    if (axios.isAxiosError(e)) {
      return new Err(new HTTPError(e.message, e.response?.status || -1));
    } else {
      return new Err(
        new Error(`Failed to get auth object for ${nangoConnectionId}`)
      );
    }
  }

  const uuid = uuidv4().toString();
  const accessToken = (await auth.getAccessToken()).token;
  const webhookURL = `${CONNECTORS_PUBLIC_URL}/webhooks/${DUST_CONNECTORS_WEBHOOKS_SECRET}/google_drive`;
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/changes/watch?pageToken=&includeItemsFromAllDrives=true",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: uuid,
        type: "web_hook",
        address: webhookURL,
        expiration: new Date().getTime() + 60 * 60 * 5 * 1000,
      }),
    }
  );

  if (res.ok) {
    const data: { id: string; expiration: string } = await res.json();
    const result: { id: string; expirationTsMs: number; url: string } = {
      id: data.id,
      expirationTsMs: parseInt(data.expiration),
      url: webhookURL,
    };
    return new Ok(result);
  } else {
    return new Err(new HTTPError(await res.text(), res.status));
  }
}
