import type { ContentNodesViewType, ModelId, Result } from "@dust-tt/types";
import {
  cacheWithRedis,
  Err,
  getGoogleIdsFromSheetContentNodeInternalId,
  isGoogleSheetContentNodeInternalId,
  Ok,
} from "@dust-tt/types";
import type { InferAttributes, WhereOptions } from "sequelize";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { GOOGLE_DRIVE_WEBHOOK_LIFE_MS } from "@connectors/connectors/google_drive/lib/config";
import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import {
  getDrivesIdsToSync,
  getSyncPageToken,
} from "@connectors/connectors/google_drive/temporal/activities";
import { isGoogleDriveSpreadSheetFile } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  getAuthObject,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { HTTPError } from "@connectors/lib/error";
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
  GoogleDriveWebhook,
} from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const { CONNECTORS_PUBLIC_URL, DUST_CONNECTORS_WEBHOOKS_SECRET } = process.env;

export async function registerWebhooksForAllDrives({
  connector,
  marginMs,
}: {
  connector: ConnectorResource;
  marginMs: number;
}): Promise<Result<undefined, Error[]>> {
  const driveIdsToSync = await getDrivesIdsToSync(connector.id);
  const allRes = await Promise.all(
    driveIdsToSync.map((driveId) => {
      return ensureWebhookForDriveId(connector, driveId, marginMs);
    })
  );

  const allErrors = allRes.flatMap((res) => (res.isErr() ? [res.error] : []));
  if (allErrors.length > 0) {
    return new Err(allErrors);
  }

  return new Ok(undefined);
}

export async function ensureWebhookForDriveId(
  connector: ConnectorResource,
  driveId: string,
  marginMs: number
): Promise<Result<string | undefined, Error>> {
  const webhook = await GoogleDriveWebhook.findOne({
    where: {
      connectorId: connector.id,
      driveId: driveId,
      expiresAt: {
        [Op.gt]: new Date(new Date().getTime() + marginMs),
      },
    },
  });
  if (!webhook) {
    const auth = await getAuthObject(connector.connectionId);
    const remoteFile = await getGoogleDriveObject(auth, driveId);
    if (!remoteFile) {
      throw new Error(`Drive with id ${driveId} not found`);
    }
    const res = await registerWebhook(
      connector,
      driveId,
      remoteFile.isInSharedDrive
    );
    if (res.isErr()) {
      return res;
    }
    const webhook = await GoogleDriveWebhook.create({
      webhookId: res.value.id,
      driveId: driveId,
      expiresAt: new Date(res.value.expirationTsMs),
      renewAt: new Date(res.value.expirationTsMs),
      connectorId: connector.id,
    });
    logger.info(
      { webhookId: webhook.webhookId, connectorId: connector.id },
      "Webhook created"
    );

    return new Ok(webhook.webhookId);
  }
  return new Ok(undefined);
}

export async function registerWebhook(
  // TODO(2024-02-14 flav) Remove ConnectorModel once fully bundled in `ConnectorResource`.
  connector: ConnectorResource | ConnectorModel,
  driveId: string,
  isSharedDrive: boolean
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
  const drive = await getDriveClient(auth);

  const uuid = uuidv4().toString();
  const syncPageToken = await getSyncPageToken(
    connector.id,
    driveId,
    isSharedDrive
  );
  const webhookURL = `${CONNECTORS_PUBLIC_URL}/webhooks/${DUST_CONNECTORS_WEBHOOKS_SECRET}/google_drive/${connector.id}`;
  const expiration = new Date().getTime() + GOOGLE_DRIVE_WEBHOOK_LIFE_MS;
  const res = await drive.changes.watch(
    {
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      driveId: driveId,
      pageToken: syncPageToken,
      requestBody: {
        id: uuid,
        type: "web_hook",
        address: webhookURL,
        expiration: expiration.toString(),
      },
    },
    {}
  );
  if (res.status !== 200) {
    return new Err(new HTTPError(res.statusText, res.status));
  }
  if (!res.data.expiration) {
    return new Err(new Error("Missing expiration in response"));
  }
  if (!res.data.id) {
    return new Err(new Error("Missing id in response"));
  }

  return new Ok({
    id: res.data.id,
    expirationTsMs: parseInt(res.data.expiration),
    url: webhookURL,
  });
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
