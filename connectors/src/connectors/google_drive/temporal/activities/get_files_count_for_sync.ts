import { Op } from "sequelize";

import { GoogleDriveFilesModel } from "@connectors/lib/models/google_drive";
import type { ModelId } from "@connectors/types";

/**
 * Count the number of files that were synced (upserted) during this sync run.
 * Uses lastSeenTs to identify files touched in this sync.
 */
export async function getFilesCountForSync(
  connectorId: ModelId,
  startSyncTs: number
): Promise<number> {
  const count = await GoogleDriveFilesModel.count({
    where: {
      connectorId,
      lastSeenTs: {
        [Op.gte]: new Date(startSyncTs),
      },
    },
  });

  return count;
}
