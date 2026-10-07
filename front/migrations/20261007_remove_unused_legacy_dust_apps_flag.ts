import { QueryTypes } from "sequelize";

import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

const BATCH_SIZE = 500;
const FEATURE_FLAG_NAME: WhitelistableFeature = "legacy_dust_apps";
const USAGE_WINDOW_DAYS = 365;

// 20251016_gate_workspaces_in_legacy_dust_apps granted the flag to every workspace that had ever
// created an app. Keep it only on workspaces that ran an app in the usage window. App runs are
// recorded as "deploy" runs with a non-null appId, whether they come from the public API or from
// the run_dust_app agent tool. Runs started from the app editor are not recorded.
makeScript({}, async ({ execute }, logger) => {
  const flagCount =
    await FeatureFlagResource.countForAllWorkspaces(FEATURE_FLAG_NAME);
  const flags = await FeatureFlagResource.dangerouslyListForAllWorkspacesByName(
    FEATURE_FLAG_NAME,
    { limit: flagCount }
  );

  // Walks apps (small) rather than runs (every LLM call lands there) so each lookup hits the
  // (workspaceId, appId, runType, createdAt) index.
  const activeRows = await frontSequelize.query<{ workspaceId: number }>(
    `
      SELECT DISTINCT a."workspaceId"
      FROM apps a
      WHERE a."workspaceId" IN (
        SELECT "workspaceId" FROM feature_flags WHERE name = :featureFlag
      )
      AND EXISTS (
        SELECT 1
        FROM runs r
        WHERE r."workspaceId" = a."workspaceId"
          AND r."appId" = a.id
          AND r."runType" = 'deploy'
          AND r."createdAt" > NOW() - make_interval(days => :usageWindowDays)
      )
    `,
    {
      replacements: {
        featureFlag: FEATURE_FLAG_NAME,
        usageWindowDays: USAGE_WINDOW_DAYS,
      },
      type: QueryTypes.SELECT,
    }
  );
  const activeWorkspaceModelIds = new Set(
    activeRows.map((row) => row.workspaceId)
  );

  const workspaceModelIdsToDisable = flags
    .map((flag) => flag.workspaceId)
    .filter((workspaceId) => !activeWorkspaceModelIds.has(workspaceId));

  logger.info(
    {
      execute,
      featureFlag: FEATURE_FLAG_NAME,
      usageWindowDays: USAGE_WINDOW_DAYS,
      flaggedCount: flags.length,
      keptCount: flags.length - workspaceModelIdsToDisable.length,
      toDisableCount: workspaceModelIdsToDisable.length,
      keptWorkspaceModelIds: Array.from(activeWorkspaceModelIds),
    },
    "Computed workspaces to remove the legacy Dust Apps feature flag from."
  );

  if (!execute) {
    return;
  }

  let deletedCount = 0;
  for (
    let offset = 0;
    offset < workspaceModelIdsToDisable.length;
    offset += BATCH_SIZE
  ) {
    const batch = workspaceModelIdsToDisable.slice(offset, offset + BATCH_SIZE);
    deletedCount +=
      await FeatureFlagResource.dangerouslyDisableForWorkspaceModelIds(
        FEATURE_FLAG_NAME,
        batch
      );
    logger.info(
      { processed: offset + batch.length, deletedCount },
      "Removed legacy Dust Apps feature flag for batch."
    );
  }
});
