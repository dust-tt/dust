import type { ModelId } from "@dust-tt/types";
import { cacheWithRedis } from "@dust-tt/types";
import { v4 as uuidv4 } from "uuid";

import { HTTPError } from "@connectors/lib/error";
import type { Connector } from "@connectors/lib/models";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { Err, Ok, type Result } from "@connectors/lib/result.js";

import { getAuthObject } from "./temporal/activities";
const { CONNECTORS_PUBLIC_URL, DUST_CONNECTORS_WEBHOOKS_SECRET } = process.env;

export async function registerWebhook(
  connector: Connector
): Promise<
  Result<{ id: string; expirationTsMs: number; url: string }, HTTPError | Error>
> {
  if (!DUST_CONNECTORS_WEBHOOKS_SECRET) {
    return new Err(new Error("DUST_CONNECTORS_WEBHOOKS_SECRET is not defined"));
  }
  if (!CONNECTORS_PUBLIC_URL) {
    return new Err(new Error("CONNECTORS_PUBLIC_URL is not defined"));
  }
  const auth = await getAuthObject(connector.connectionId);

  const uuid = uuidv4().toString();
  const accessToken = (await auth.getAccessToken()).token;
  const webhookURL = `${CONNECTORS_PUBLIC_URL}/webhooks/${DUST_CONNECTORS_WEBHOOKS_SECRET}/google_drive/${connector.id}`;
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
        expiration: new Date().getTime() + 60 * 60 * 7 * 1000,
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

async function _getLocalParents(
  connectorId: ModelId,
  driveObjectId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for memoization
  memoizationKey: string
): Promise<string[]> {
  const parents: string[] = [driveObjectId];

  const object = await GoogleDriveFiles.findOne({
    where: {
      connectorId,
      driveFileId: driveObjectId,
    },
  });

  if (!object || !object.parentId) {
    return parents;
  }

  return parents.concat(
    await getLocalParents(connectorId, object.parentId, memoizationKey)
  );
}

export const getLocalParents = cacheWithRedis(
  _getLocalParents,
  (connectorId, driveObjectId, memoizationKey) => {
    return `${connectorId}:${driveObjectId}:${memoizationKey}`;
  },
  60 * 10 * 1000
);
