import type { ContentNodesViewType, ModelId } from "@dust-tt/types";
import {
  cacheWithRedis,
  getGoogleIdsFromSheetContentNodeInternalId,
  isGoogleSheetContentNodeInternalId,
} from "@dust-tt/types";
import type { InferAttributes, WhereOptions } from "sequelize";

import { isGoogleDriveSpreadSheetFile } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  GoogleDriveFiles,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";

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
