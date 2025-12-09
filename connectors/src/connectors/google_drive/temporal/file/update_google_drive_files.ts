import type { CreationAttributes } from "sequelize";

import { GoogleDriveFilesModel } from "@connectors/lib/models/google_drive";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";

export async function updateGoogleDriveFiles(
  connectorId: ModelId,
  documentId: string,
  file: GoogleDriveObjectType,
  skipReason: string | undefined,
  upsertTimestampMs: number | undefined
): Promise<void> {
  const params: CreationAttributes<GoogleDriveFilesModel> = {
    connectorId,
    dustFileId: documentId,
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parentId: file.parent,
    lastSeenTs: new Date(),
    skipReason,
  };

  if (upsertTimestampMs) {
    params.lastUpsertedTs = new Date(upsertTimestampMs);
  }

  await GoogleDriveFilesModel.upsert(params);
}
