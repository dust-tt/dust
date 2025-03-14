import type { OAuth2Client } from "googleapis-common";
import type { GaxiosError } from "googleapis-common";

import {
  driveObjectToDustType,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";
import { FILE_ATTRIBUTES_TO_FETCH } from "@connectors/types";

interface CacheKey {
  connectorId: number;
  ts: string | number;
}

async function _getGoogleDriveObject({
  connectorId,
  authCredentials,
  driveObjectId,
}: {
  connectorId: ModelId;
  authCredentials: OAuth2Client;
  driveObjectId: string;
}): Promise<GoogleDriveObjectType | null> {
  const drive = await getDriveClient(authCredentials);

  try {
    const res = await drive.files.get({
      fileId: driveObjectId,
      supportsAllDrives: true,
      fields: FILE_ATTRIBUTES_TO_FETCH.join(","),
    });
    if (res.status !== 200) {
      throw new Error(
        `Error getting files. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }
    const file = res.data;

    return await driveObjectToDustType(connectorId, file, authCredentials);
  } catch (e) {
    if ((e as GaxiosError).response?.status === 401) {
      throw new ExternalOAuthTokenError();
    }
    if ((e as GaxiosError).response?.status === 404) {
      return null;
    }
    throw e;
  }
}

const cachedGetGoogleDriveObject = cacheWithRedis<
  GoogleDriveObjectType | null,
  [
    {
      connectorId: ModelId;
      authCredentials: OAuth2Client;
      driveObjectId: string;
      cacheKey: CacheKey;
    },
  ]
>(
  _getGoogleDriveObject,
  ({ driveObjectId, cacheKey }) => {
    return `${cacheKey.connectorId}:${driveObjectId}:${cacheKey.ts}`;
  },
  60 * 10 * 1000
);

export async function getGoogleDriveObject({
  connectorId,
  authCredentials,
  driveObjectId,
  cacheKey,
}: {
  connectorId: ModelId;
  authCredentials: OAuth2Client;
  driveObjectId: string;
  cacheKey?: CacheKey;
}): Promise<GoogleDriveObjectType | null> {
  if (cacheKey) {
    return cachedGetGoogleDriveObject({
      connectorId,
      authCredentials,
      driveObjectId,
      cacheKey,
    });
  }
  return _getGoogleDriveObject({ connectorId, authCredentials, driveObjectId });
}
