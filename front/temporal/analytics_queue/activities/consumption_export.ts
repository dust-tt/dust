import { fetchConsumptionLinesExportZip } from "@app/lib/api/analytics/consumption/export_lines";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";

// Files are namespaced by workspace under a single top-level prefix so the cleanup job can
// scan every workspace's exports in one bucket listing.
export function buildConsumptionExportGcsPrefix(workspaceId: string): string {
  return `consumption_exports/w/${workspaceId}/`;
}

// exportId is the workflow ID (stable across activity retries, unlike a
// timestamp computed here), so a retry after a lost completion ack overwrites
// the same object instead of leaving an orphaned duplicate zip.
function buildConsumptionExportGcsPath(
  workspaceId: string,
  exportId: string
): string {
  return `${buildConsumptionExportGcsPrefix(workspaceId)}${exportId}.zip`;
}

export async function runConsumptionExportActivity(
  authType: AuthenticatorType,
  {
    period,
    filter,
    exportId,
  }: {
    period: ConsumptionPeriod;
    filter: ConsumptionScopeFilter;
    exportId: string;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const result = await fetchConsumptionLinesExportZip(auth, { period, filter });
  if (result.isErr()) {
    logger.error(
      { workspaceId, err: result.error },
      "[ConsumptionExport] Failed to build consumption lines export."
    );
    throw result.error;
  }

  const gcsPath = buildConsumptionExportGcsPath(workspaceId, exportId);

  await getPrivateUploadBucket()
    .file(gcsPath)
    .save(result.value, { contentType: "application/zip", resumable: false });
}
