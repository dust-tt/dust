import { fetchConsumptionLinesExportZip } from "@app/lib/api/analytics/consumption/export_lines";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";

// Files are namespaced by workspace under a single top-level prefix so the cleanup job can
// scan every workspace's exports in one bucket listing.
export function buildConsumptionExportGcsPrefix(workspaceSId: string): string {
  return `consumption_exports/w/${workspaceSId}/`;
}

function buildConsumptionExportGcsPath(
  workspaceSId: string,
  timestamp: number
): string {
  return `${buildConsumptionExportGcsPrefix(workspaceSId)}${timestamp}.zip`;
}

export async function runConsumptionExportActivity(
  authType: AuthenticatorType,
  {
    period,
    filter,
  }: {
    period: ConsumptionPeriod;
    filter: ConsumptionScopeFilter;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const workspaceSId = auth.getNonNullableWorkspace().sId;

  const result = await fetchConsumptionLinesExportZip(auth, { period, filter });
  if (result.isErr()) {
    logger.error(
      { workspaceId: workspaceSId, err: result.error },
      "[ConsumptionExport] Failed to build consumption lines export."
    );
    throw result.error;
  }

  // Generated inside the activity (not the workflow, which must stay deterministic). Safe as
  // a plain timestamp because the deterministic per-workspace workflow ID guarantees at most
  // one export activity runs per workspace at a time.
  const gcsPath = buildConsumptionExportGcsPath(workspaceSId, Date.now());

  await getPrivateUploadBucket()
    .file(gcsPath)
    .save(result.value, { contentType: "application/zip", resumable: false });
}
