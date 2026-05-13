import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { BATCH_SIZE } from "@app/temporal/sandbox_reaper/config";

interface RequestSandboxKillsActivityInput {
  baseImage: string;
  version?: string;
}

/**
 * Mark up to `BATCH_SIZE` non-deleted sandboxes for the given `baseImage` (and
 * any version different from `version`, if provided) with `killRequestedAt =
 * now()`. Returns the count of rows updated.
 *
 * Already-marked rows (`killRequestedAt IS NOT NULL`) are skipped — re-runs
 * won't push the timestamp forward.
 */
export async function requestSandboxKillsActivity({
  baseImage,
  version,
}: RequestSandboxKillsActivityInput): Promise<number> {
  const affectedCount =
    await SandboxResource.dangerouslyRequestKillForBaseImage({
      baseImage,
      version,
      limit: BATCH_SIZE,
    });

  logger.info(
    { baseImage, version, affectedCount },
    "Kill-requester: marked sandboxes."
  );

  return affectedCount;
}
