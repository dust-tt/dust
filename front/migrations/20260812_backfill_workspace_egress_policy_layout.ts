import config from "@app/lib/api/config";
import { getBucketInstance } from "@app/lib/file_storage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

// Copies every legacy workspace egress policy (`workspaces/{wId}.json`) to
// the owner-keyed layout path (`w/{wId}/sandbox-egress-policy.json`) when the
// new object is absent. Workspaces that saved network settings since the
// relayout already dual-wrote both paths and are skipped; this backfill only
// exists for workspaces whose last save predates the relayout, so the proxy's
// legacy fallback (and front's dual-write) can be removed afterwards.
//
// Expected cardinality: at most one object per workspace that ever saved
// sandbox network settings — hundreds, not millions.
//
// Idempotent and restartable. In execute mode the copy is attempted directly
// with an ifGenerationMatch: 0 precondition — "destination absent" is checked
// and enforced atomically by GCS, so an object that appears concurrently (an
// admin save dual-writing the new path) wins and the copy counts as skipped.
// The backfill never overwrites a newer policy.
//
// /!\ The policy bucket is per-region: run once in each region.
// Use --wId <workspace sId> to verify a single workspace before the full run.
const LEGACY_WORKSPACE_POLICY_PREFIX = "workspaces/";

// Matches getLegacyWorkspacePolicyPath / getWorkspacePolicyPath in
// lib/api/sandbox/egress_policy.ts.
const LEGACY_OBJECT_PATTERN = /^workspaces\/([A-Za-z0-9_-]+)\.json$/;

const COPY_CONCURRENCY = 8;

type BackfillOutcome = "copied" | "skipped" | "unexpected";

function newLayoutPath(workspaceId: string): string {
  return `w/${workspaceId}/sandbox-egress-policy.json`;
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    const bucket = getBucketInstance(config.getEgressPolicyBucket());

    const { files } = await bucket.getAllFilesByPrefix({
      prefix: wId
        ? `${LEGACY_WORKSPACE_POLICY_PREFIX}${wId}.json`
        : LEGACY_WORKSPACE_POLICY_PREFIX,
    });

    const outcomes = await concurrentExecutor(
      files,
      async (file): Promise<BackfillOutcome> => {
        const match = file.name.match(LEGACY_OBJECT_PATTERN);
        if (!match) {
          logger.warn(
            { object: file.name },
            "Unexpected object under the legacy prefix, skipping."
          );
          return "unexpected";
        }
        const destinationPath = newLayoutPath(match[1]);

        if (!execute) {
          // Dry run: exists() gives an accurate would-copy count. Execute
          // mode skips this read — the copy's precondition enforces it
          // atomically.
          const [exists] = await bucket.file(destinationPath).exists();
          if (exists) {
            return "skipped";
          }
          logger.info(
            { object: file.name, destinationPath },
            "Would copy legacy workspace policy to the new layout."
          );
          return "copied";
        }

        try {
          await file.copy(bucket.file(destinationPath), {
            preconditionOpts: { ifGenerationMatch: 0 },
          });
        } catch (error) {
          // 412 = the destination already exists (dual-written by a save, or
          // a previous run of this script): the existing object wins.
          if (error instanceof Error && "code" in error && error.code === 412) {
            return "skipped";
          }
          throw error;
        }
        logger.info(
          { object: file.name, destinationPath },
          "Copied legacy workspace policy to the new layout."
        );
        return "copied";
      },
      { concurrency: COPY_CONCURRENCY }
    );

    const counts = { copied: 0, skipped: 0, unexpected: 0 };
    for (const outcome of outcomes) {
      counts[outcome]++;
    }

    logger.info(
      { ...counts, total: files.length },
      execute ? "Backfill complete." : "Dry run complete."
    );
  }
);
