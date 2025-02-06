import { cacheWithRedis } from "@dust-tt/types";
import type { OAuth2Client } from "googleapis-common";
import type { GaxiosError } from "googleapis-common";

import {
  driveObjectToDustType,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";
import { FILE_ATTRIBUTES_TO_FETCH } from "@connectors/types/google_drive";

async function _getGoogleDriveObject(
  authCredentials: OAuth2Client,
  driveObjectId: string
): Promise<GoogleDriveObjectType | null> {
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

    return await driveObjectToDustType(file, authCredentials);
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
  [OAuth2Client, string, number, string | number]
>(
  _getGoogleDriveObject,
  (_, driveObjectId, connectorId, memoizationKey) => {
    return `${connectorId}:${driveObjectId}:${memoizationKey}`;
  },
  60 * 10 * 1000
);

export async function getGoogleDriveObject(
  authCredentials: OAuth2Client,
  driveObjectId: string,
  connectorId?: number,
  memoizationKey?: string | number
): Promise<GoogleDriveObjectType | null> {
  if (connectorId && memoizationKey) {
    return cachedGetGoogleDriveObject(
      authCredentials,
      driveObjectId,
      connectorId,
      memoizationKey
    );
  }
  return _getGoogleDriveObject(authCredentials, driveObjectId);
}
