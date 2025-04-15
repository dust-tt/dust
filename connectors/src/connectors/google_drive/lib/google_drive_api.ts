import type { OAuth2Client } from "googleapis-common";
import type { GaxiosError } from "googleapis-common";

import {
  GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID,
  GOOGLE_DRIVE_SHARED_WITH_ME_WEB_URL,
  GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID,
} from "@connectors/connectors/google_drive/lib/consts";
import {
  driveObjectToDustType,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";
import { cacheWithRedis, INTERNAL_MIME_TYPES } from "@connectors/types";
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
  // Special handling for the virtual "Shared with me" folder
  if (driveObjectId === GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID) {
    return getSharedWithMeVirtualFolder();
  }

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

function getSharedWithMeVirtualFolder(): GoogleDriveObjectType {
  return {
    id: GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID,
    name: "Shared with me",
    parent: null,
    mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.SHARED_WITH_ME,
    webViewLink: GOOGLE_DRIVE_SHARED_WITH_ME_WEB_URL,
    createdAtMs: Date.now(),
    trashed: false,
    size: null,
    driveId: GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID,
    isInSharedDrive: false,
    capabilities: {
      canDownload: false,
    },
    labels: [],
  };
}
