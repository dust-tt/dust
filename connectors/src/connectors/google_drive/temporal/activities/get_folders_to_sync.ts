import { GoogleDriveFoldersModel } from "@connectors/lib/models/google_drive";
import type { ModelId } from "@connectors/types";

export async function getFoldersToSync(connectorId: ModelId) {
  const folders = await GoogleDriveFoldersModel.findAll({
    where: {
      connectorId: connectorId,
    },
  });

  const foldersIds = folders.map((f) => f.folderId);

  return foldersIds;
}
