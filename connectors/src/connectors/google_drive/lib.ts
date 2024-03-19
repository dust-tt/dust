import type { ContentNodesViewType, ModelId, Result } from "@dust-tt/types";
import {
  cacheWithRedis,
  Err,
  getGoogleIdsFromSheetContentNodeInternalId,
  isGoogleSheetContentNodeInternalId,
  Ok,
} from "@dust-tt/types";
import type { InferAttributes, WhereOptions } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { isGoogleDriveSpreadSheetFile } from "@connectors/connectors/google_drive/temporal/mime_types";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
import { HTTPError } from "@connectors/lib/error";
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const { CONNECTORS_PUBLIC_URL, DUST_CONNECTORS_WEBHOOKS_SECRET } = process.env;

export async function registerWebhook(
  // TODO(2024-02-14 flav) Remove ConnectorModel once fully bundled in `ConnectorResource`.
  connector: ConnectorResource | ConnectorModel
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
    let errorMsg = await res.text();
    try {
      // Gdrive returns JSON errors, attempt to parse it.
      const error = JSON.parse(errorMsg);
      errorMsg = error.error.message;
    } catch (e) {
      // Keep the raw text as error message
    }
    return new Err(new HTTPError(errorMsg, res.status));
  }
}

export async function isDriveObjectExpandable({
  objectId,
  mimeType,
  connectorId,
  viewType,
}: {
  objectId: string;
  mimeType: string;
  connectorId: ModelId;
  viewType: ContentNodesViewType;
}): Promise<boolean> {
  if (isGoogleDriveSpreadSheetFile({ mimeType }) && viewType === "tables") {
    // In tables view, Spreadsheets can be expanded to show their sheets.
    return !!(await GoogleDriveSheet.findOne({
      attributes: ["id"],
      where: {
        driveFileId: objectId,
        connectorId: connectorId,
      },
    }));
  }

  const where: WhereOptions<InferAttributes<GoogleDriveFiles>> = {
    connectorId: connectorId,
    parentId: objectId,
  };

  if (viewType === "tables") {
    // In tables view, we only show folders and spreadhsheets.
    // A folder that only contains Documents is not expandable.
    where.mimeType = [
      "application/vnd.google-apps.folder",
      "application/vnd.google-apps.spreadsheet",
    ];
  }

  return !!(await GoogleDriveFiles.findOne({
    attributes: ["id"],
    where,
  }));
}

async function _getLocalParents(
  connectorId: ModelId,
  contentNodeInternalId: string,
  memoizationKey: string
): Promise<string[]> {
  const parents: string[] = [contentNodeInternalId];

  let parentId: string | null = null;

  if (isGoogleSheetContentNodeInternalId(contentNodeInternalId)) {
    // For a Google Sheet, the parent ID is the ContentNodeInternalId
    // of the Google Spreadsheet that contains the sheet.
    const { googleFileId } = getGoogleIdsFromSheetContentNodeInternalId(
      contentNodeInternalId
    );
    parentId = googleFileId;
  } else {
    const object = await GoogleDriveFiles.findOne({
      where: {
        connectorId,
        driveFileId: contentNodeInternalId,
      },
    });
    parentId = object?.parentId ?? null;
  }

  if (!parentId) {
    return parents;
  }

  return parents.concat(
    await getLocalParents(connectorId, parentId, memoizationKey)
  );
}

export const getLocalParents = cacheWithRedis(
  _getLocalParents,
  (connectorId, contentNodeInternalId, memoizationKey) => {
    return `${connectorId}:${contentNodeInternalId}:${memoizationKey}`;
  },
  60 * 10 * 1000
);
