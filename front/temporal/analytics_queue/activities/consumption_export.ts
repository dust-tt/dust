import { fetchConsumptionLinesExportZip } from "@app/lib/api/analytics/consumption/export_lines";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionScopeFilterKey,
} from "@app/lib/api/analytics/consumption/scope";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import { createHash } from "crypto";

// Files live under the workspace's own prefix (matching the `w/{wId}/...` layout used elsewhere
// in this bucket) so relocation and scrubbing can operate on the workspace prefix directly.
export function buildConsumptionExportGcsPrefix(workspaceId: string): string {
  return `w/${workspaceId}/consumption_exports/`;
}

// exportId is a content hash (see buildConsumptionExportCacheKey) identifying the export's
// GCS object, so a retry within the same triggered export (same args, same hash) overwrites
// the same object instead of leaving an orphaned duplicate zip, and — for closed periods —
// a later request for the same period/filter reuses it instead of recrunching.
export function buildConsumptionExportGcsPath(
  workspaceId: string,
  exportId: string
): string {
  return `${buildConsumptionExportGcsPrefix(workspaceId)}${exportId}.zip`;
}

// Sorted independently of request key/array order so equivalent filters hash identically.
function canonicalizeConsumptionScopeFilter(
  filter: ConsumptionScopeFilter
): ReadonlyArray<readonly [ConsumptionScopeFilterKey, string[]]> {
  return Object.entries(filter)
    .filter((entry): entry is [ConsumptionScopeFilterKey, string[]] => {
      const [, values] = entry;
      return values !== undefined && values.length > 0;
    })
    .map(([key, values]) => [key, [...values].sort()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
}

// Hashed (rather than kept as plain text) because a filter selecting many agents/users/tools
// can get long, and this value is used as a GCS object name. `salt`, when passed, forces a
// unique key regardless of period/filter — used for open-ended periods (e.g. "this cycle")
// whose data keeps changing while the period itself stays the same, so every trigger must
// produce its own export rather than reusing a previous, now-stale one.
export function buildConsumptionExportCacheKey({
  period,
  filter,
  salt,
}: {
  period: ConsumptionPeriod;
  filter: ConsumptionScopeFilter;
  salt?: string;
}): string {
  const payload = JSON.stringify({
    startDate: period.startDate,
    endDate: period.endDate,
    filter: canonicalizeConsumptionScopeFilter(filter),
    salt: salt ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
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
