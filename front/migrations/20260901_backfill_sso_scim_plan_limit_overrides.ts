import {
  getWorkspacePlanLimitOverrides,
  setWorkspacePlanLimitOverrides,
} from "@app/lib/api/plan_limit_overrides";
import { Authenticator } from "@app/lib/auth";
import type {
  OverridablePlanFlag,
  PlanLimitOverride,
} from "@app/lib/plans/plan_limit_overrides";
import { EMPTY_PLAN_LIMIT_OVERRIDE } from "@app/lib/plans/plan_limit_overrides";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Backfills the `isSSOAllowed` / `isSCIMAllowed` plan-limit overrides from the legacy
// `allow_sso` / `allow_scim` feature flags, so the workspaces that relied on a flag keep their
// entitlement once the flags are gone from the code.
//
// Run this BEFORE merging the PR that drops the flags: while the old code is still live both
// mechanisms grant the feature, so there is no window where a workspace loses SSO or SCIM.
// Merging then removes the flag path and the override carries the entitlement.
//
// The flag names are already out of `WHITELISTABLE_FEATURES`, so this reads the rows by name
// rather than through `FeatureFlagResource.listForWorkspace` (which filters unknown names out).
// It only reads the flag rows — deleting them is a separate step, see
// `scripts/delete_legacy_feature_flag.ts`.
//
// Dry run by default:
//   npx tsx migrations/20260901_backfill_sso_scim_plan_limit_overrides.ts [--execute]

// Legacy flag name -> the plan-limit override that replaces it.
const FLAG_MIGRATIONS: {
  flagName: string;
  overrideKey: OverridablePlanFlag;
}[] = [
  { flagName: "allow_sso", overrideKey: "isSSOAllowed" },
  { flagName: "allow_scim", overrideKey: "isSCIMAllowed" },
];

/**
 * The full override row to write. The row holds every overridable limit at once and
 * `setWorkspacePlanLimitOverrides` replaces it wholesale, so the existing values have to
 * be carried over — writing only the flags would clear any negotiated seat, space or
 * data-source override this workspace already has.
 */
function buildBackfilledOverride(
  existingOverride: PlanLimitOverride | null,
  overrideKeys: OverridablePlanFlag[]
): PlanLimitOverride {
  return {
    ...(existingOverride ?? EMPTY_PLAN_LIMIT_OVERRIDE),
    ...Object.fromEntries(overrideKeys.map((key) => [key, true])),
  };
}

/**
 * Lists the workspaces holding a legacy flag, and which override each one needs. A
 * workspace with both flags gets a single entry so it is written once.
 */
async function listOverrideKeysByWorkspaceModelId(
  logger: Logger
): Promise<Map<ModelId, OverridablePlanFlag[]>> {
  const overrideKeysByWorkspaceModelId = new Map<
    ModelId,
    OverridablePlanFlag[]
  >();

  for (const { flagName, overrideKey } of FLAG_MIGRATIONS) {
    const rowCount = await FeatureFlagResource.countLegacyByName(flagName);
    if (rowCount === 0) {
      logger.info({ flagName }, "No workspace holds this flag.");
      continue;
    }

    const flags =
      await FeatureFlagResource.dangerouslyListForAllWorkspacesByName(
        flagName,
        { limit: rowCount }
      );
    if (flags.length !== rowCount) {
      logger.warn(
        { flagName, rowCount, listed: flags.length },
        "Listed fewer rows than counted; re-run to pick up the remainder."
      );
    }

    logger.info(
      { flagName, overrideKey, workspaceCount: flags.length },
      "Found workspaces holding the flag."
    );

    for (const flag of flags) {
      const keys = overrideKeysByWorkspaceModelId.get(flag.workspaceId) ?? [];
      overrideKeysByWorkspaceModelId.set(flag.workspaceId, [
        ...keys,
        overrideKey,
      ]);
    }
  }

  return overrideKeysByWorkspaceModelId;
}

async function processWorkspace(
  workspaceId: string,
  overrideKeys: OverridablePlanFlag[],
  execute: boolean,
  logger: Logger
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const existingOverride = await getWorkspacePlanLimitOverrides(auth);

  logger.info(
    { workspaceId, overrideKeys },
    execute ? "Setting overrides." : "Would set overrides."
  );

  if (!execute) {
    return;
  }

  const res = await setWorkspacePlanLimitOverrides(
    auth,
    buildBackfilledOverride(existingOverride, overrideKeys)
  );
  if (res.isErr()) {
    logger.error(
      { workspaceId, overrideKeys, error: res.error.message },
      "Failed to set overrides."
    );
    return;
  }

  logger.info({ workspaceId, overrideKeys }, "Overrides set.");
}

makeScript({}, async ({ execute }, logger) => {
  const overrideKeysByWorkspaceModelId =
    await listOverrideKeysByWorkspaceModelId(logger);

  const workspaceModelIds = [...overrideKeysByWorkspaceModelId.keys()];
  if (workspaceModelIds.length === 0) {
    logger.info("Nothing to backfill.");
    return;
  }

  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceModelIds);

  const missingCount = workspaceModelIds.length - workspaces.length;
  if (missingCount > 0) {
    // Flag rows outliving their workspace: nothing to backfill for them.
    logger.warn(
      { missingCount },
      "Some flagged workspaces no longer exist, skipping them."
    );
  }

  logger.info(
    { candidates: workspaces.length },
    `${execute ? "Executing" : "[DRY RUN]"} over ${workspaces.length} workspace(s)`
  );

  // Sequential on purpose: only a handful of workspaces ever held these flags, and each one
  // costs a few queries.
  for (const workspace of workspaces) {
    const overrideKeys = overrideKeysByWorkspaceModelId.get(workspace.id) ?? [];
    try {
      await processWorkspace(workspace.sId, overrideKeys, execute, logger);
    } catch (err) {
      logger.error(
        { workspaceId: workspace.sId, error: normalizeError(err).message },
        "Unexpected error while processing workspace."
      );
    }
  }
});
