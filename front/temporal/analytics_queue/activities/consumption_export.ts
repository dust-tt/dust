import {
  buildConsumptionLineExportCsvHeader,
  fetchConsumptionExportBucketCsv,
} from "@app/lib/api/analytics/consumption/export_lines";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionScopeFilterKey,
} from "@app/lib/api/analytics/consumption/scope";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import type { FileStorage } from "@app/lib/file_storage";
import {
  GCS_COMPOSE_MAX_SOURCES,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { notifyConsumptionExportReady } from "@app/lib/notifications/workflows/consumption-export-ready";
import logger from "@app/logger/logger";
import { createHash } from "crypto";

// Kept as a top-level prefix (not nested under `w/{workspaceId}/`) so a single GCS
// lifecycle matches_prefix rule can target every workspace's exports for expiry.
export function buildConsumptionExportGcsPrefix(workspaceId: string): string {
  return `consumption_exports/${workspaceId}/`;
}

export function buildConsumptionExportGcsPath(
  workspaceId: string,
  exportId: string
): string {
  return `${buildConsumptionExportGcsPrefix(workspaceId)}${exportId}.csv`;
}

// Per-bucket CSV parts live here until the export is finalized into a single file, then
// get cleaned up.
export function buildConsumptionExportBucketPartsGcsPrefix(
  workspaceId: string,
  exportId: string
): string {
  return `consumption_exports_tmp/${workspaceId}/${exportId}/`;
}

function buildConsumptionExportBucketPartGcsPath(
  workspaceId: string,
  exportId: string,
  bucketIndex: number
): string {
  return `${buildConsumptionExportBucketPartsGcsPrefix(workspaceId, exportId)}${bucketIndex}.csv`;
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

// Fetches and writes a single 6-hour bucket of the export as a CSV part on GCS. Splitting
// the export this way, rather than one activity paginating over the whole period, bounds
// how much each activity has to fetch and lets a failed bucket retry independently.
export async function runConsumptionExportBucketActivity(
  authType: AuthenticatorType,
  {
    period,
    filter,
    exportId,
    bucketIndex,
  }: {
    period: ConsumptionPeriod;
    filter: ConsumptionScopeFilter;
    exportId: string;
    bucketIndex: number;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const result = await fetchConsumptionExportBucketCsv(auth, {
    period,
    filter,
  });
  if (result.isErr()) {
    logger.error(
      { workspaceId, exportId, bucketIndex, err: result.error },
      "[ConsumptionExport] Failed to fetch consumption lines for bucket."
    );
    throw result.error;
  }

  const gcsPath = buildConsumptionExportBucketPartGcsPath(
    workspaceId,
    exportId,
    bucketIndex
  );

  await getPrivateUploadBucket()
    .file(gcsPath)
    .save(Buffer.from(result.value, "utf-8"), {
      contentType: "text/csv",
      resumable: false,
    });
}

// Concatenates `sourcePaths` into `destinationPath` via server-side GCS compose: no bytes
// pass through this process. GCS caps a single compose call at GCS_COMPOSE_MAX_SOURCES, so
// sources beyond that are folded down through intermediate objects (under `tmpPrefix`,
// cleaned up by the caller) a round at a time until what's left fits in one call.
async function composeInStages(
  bucket: FileStorage,
  sourcePaths: string[],
  destinationPath: string,
  tmpPrefix: string
): Promise<void> {
  let paths = sourcePaths;
  let round = 0;
  while (paths.length > GCS_COMPOSE_MAX_SOURCES) {
    const nextPaths: string[] = [];
    for (let i = 0; i < paths.length; i += GCS_COMPOSE_MAX_SOURCES) {
      const chunk = paths.slice(i, i + GCS_COMPOSE_MAX_SOURCES);
      const intermediatePath = `${tmpPrefix}stage-${round}-${nextPaths.length}.csv`;
      await bucket.composeFiles(chunk, intermediatePath);
      nextPaths.push(intermediatePath);
    }
    paths = nextPaths;
    round++;
  }

  await bucket.composeFiles(paths, destinationPath);
}

// Composes the header and every bucket CSV part into the final export, notifies the
// requester, then cleans up the temporary parts. Composing (rather than downloading every
// part and re-uploading the concatenation) means the export's data never passes through
// this activity at all — only object names do.
export async function finalizeConsumptionExportActivity(
  authType: AuthenticatorType,
  {
    exportId,
    bucketCount,
  }: {
    exportId: string;
    bucketCount: number;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const bucket = getPrivateUploadBucket();

  const tmpPrefix = buildConsumptionExportBucketPartsGcsPrefix(
    workspaceId,
    exportId
  );
  const headerPath = `${tmpPrefix}header.csv`;
  await bucket
    .file(headerPath)
    .save(Buffer.from(buildConsumptionLineExportCsvHeader(), "utf-8"), {
      contentType: "text/csv",
      resumable: false,
    });

  // Bucket indices are composed in order so rows stay sorted by their bucket's time
  // window, matching the ordering the single-shot pagination used to produce.
  const bucketPartPaths = Array.from(
    { length: bucketCount },
    (_, bucketIndex) =>
      buildConsumptionExportBucketPartGcsPath(
        workspaceId,
        exportId,
        bucketIndex
      )
  );

  const gcsPath = buildConsumptionExportGcsPath(workspaceId, exportId);
  await composeInStages(
    bucket,
    [headerPath, ...bucketPartPaths],
    gcsPath,
    tmpPrefix
  );

  notifyConsumptionExportReady(auth, exportId);

  await bucket.deleteByPrefix(tmpPrefix);
}
