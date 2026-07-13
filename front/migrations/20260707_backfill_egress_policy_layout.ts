import config from "@app/lib/api/config";
import { getBucketInstance } from "@app/lib/file_storage";
import { makeScript } from "@app/scripts/helpers";

const LEGACY_WORKSPACE_PREFIX = "workspaces/";

// Copies legacy workspace egress policy files (`workspaces/{wId}.json`) to
// the workspace-prefixed layout (`w/{wId}/sandbox-egress-policy.json`).
//
// Idempotent and safe to re-run: a workspace whose new-path object already
// exists is skipped, so the script can never clobber a policy written after
// the front cutover. Run it AFTER the front deploy that writes the new
// layout; until then, reads fall back to the legacy path anyway.
//
// Legacy objects are left in place (reads fall back to them and writes
// dual-write them for rollback safety); they get deleted with the cleanup PR
// that drops the legacy layout.
makeScript({}, async ({ execute }, logger) => {
  const bucket = getBucketInstance(config.getEgressPolicyBucket());

  const { files } = await bucket.getAllFilesByPrefix({
    prefix: LEGACY_WORKSPACE_PREFIX,
  });

  logger.info({ count: files.length }, "Found legacy workspace policy files");

  let copied = 0;
  let skippedExisting = 0;
  let skippedMalformed = 0;

  for (const file of files) {
    const match = file.name.match(/^workspaces\/([^/]+)\.json$/);
    if (!match) {
      skippedMalformed++;
      logger.warn({ file: file.name }, "Skipping unexpected object name");
      continue;
    }

    const workspaceId = match[1];
    const targetPath = `w/${workspaceId}/sandbox-egress-policy.json`;
    const target = bucket.file(targetPath);

    const [targetExists] = await target.exists();
    if (targetExists) {
      skippedExisting++;
      logger.info(
        { workspaceId, targetPath },
        "Skipping: new-layout object already exists"
      );
      continue;
    }

    if (execute) {
      await file.copy(target);
      logger.info({ workspaceId, targetPath }, "Copied policy to new layout");
    } else {
      logger.info({ workspaceId, targetPath }, "Would copy policy (dry run)");
    }
    copied++;
  }

  logger.info(
    { copied, skippedExisting, skippedMalformed, execute },
    execute
      ? "Egress policy layout backfill complete"
      : "Egress policy layout backfill dry run complete (nothing written; `copied` counts objects that would be copied)"
  );
});
