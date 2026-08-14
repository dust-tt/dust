import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";

// Top-level prefix shared by every workspace's exports (see consumption_export.ts), scanned
// in one bucket listing rather than iterating per workspace.
const CONSUMPTION_EXPORTS_PREFIX = "consumption_exports/";

const RETENTION_DAYS = 15;

export async function cleanupConsumptionExportsActivity(): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const bucket = getPrivateUploadBucket();

  const { files } = await bucket.getAllFilesByPrefix({
    prefix: CONSUMPTION_EXPORTS_PREFIX,
  });

  const staleFiles = files.filter((file) => {
    const timeCreated = file.metadata.timeCreated;
    return typeof timeCreated === "string" && Date.parse(timeCreated) < cutoff;
  });

  for (const file of staleFiles) {
    await bucket.delete(file.name, { ignoreNotFound: true });
  }

  logger.info(
    { deletedCount: staleFiles.length, scannedCount: files.length },
    "[ConsumptionExport] Cleaned up stale consumption exports."
  );
}
