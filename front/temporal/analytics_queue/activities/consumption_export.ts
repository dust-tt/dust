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

export function buildConsumptionExportGcsPrefix(workspaceId: string): string {
  return `w/${workspaceId}/consumption_exports/`;
}

export function buildConsumptionExportGcsPath(
  workspaceId: string,
  exportId: string
): string {
  return `${buildConsumptionExportGcsPrefix(workspaceId)}${exportId}.zip`;
}

export function makeConsumptionExportWorkflowIdPrefix({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `consumption-export-${workspaceId}-`;
}

export function makeConsumptionExportWorkflowId({
  workspaceId,
  exportId,
}: {
  workspaceId: string;
  exportId: string;
}): string {
  return `${makeConsumptionExportWorkflowIdPrefix({ workspaceId })}${exportId}`;
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
    .map(([key, values]): readonly [ConsumptionScopeFilterKey, string[]] => [
      key,
      [...values].sort(),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

// Hashed (rather than kept as plain text) because a filter selecting many agents/users/tools
// can get long, and this value is used as a GCS object name.
export function buildConsumptionExportCacheKey({
  period,
  filter,
}: {
  period: ConsumptionPeriod;
  filter: ConsumptionScopeFilter;
}): string {
  const payload = JSON.stringify({
    startDate: period.startDate,
    endDate: period.endDate,
    filter: canonicalizeConsumptionScopeFilter(filter),
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
