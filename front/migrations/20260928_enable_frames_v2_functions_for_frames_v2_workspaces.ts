import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

const BATCH_SIZE = 500;
const FRAMES_V2_FEATURE_FLAG: WhitelistableFeature = "frames_v2";
const FRAMES_V2_FUNCTIONS_FEATURE_FLAG: WhitelistableFeature =
  "frames_v2_functions";

// frames_v2 used to gate Frame functions too. Workspaces that already have it keep functions by
// getting frames_v2_functions. Goes through FeatureFlagResource so the per-workspace flag caches
// are invalidated.
makeScript({}, async ({ execute }, logger) => {
  const framesV2Count = await FeatureFlagResource.countForAllWorkspaces(
    FRAMES_V2_FEATURE_FLAG
  );
  const framesV2Flags =
    await FeatureFlagResource.dangerouslyListForAllWorkspacesByName(
      FRAMES_V2_FEATURE_FLAG,
      { limit: framesV2Count }
    );
  const workspaceModelIds = framesV2Flags.map((flag) => flag.workspaceId);

  logger.info(
    { execute, workspaceCount: workspaceModelIds.length },
    "Enabling frames_v2_functions for frames_v2 workspaces"
  );

  if (!execute) {
    return;
  }

  for (
    let offset = 0;
    offset < workspaceModelIds.length;
    offset += BATCH_SIZE
  ) {
    const batch = workspaceModelIds.slice(offset, offset + BATCH_SIZE);
    // Skips workspaces that already have the flag.
    await FeatureFlagResource.enableForWorkspaceModelIds(
      FRAMES_V2_FUNCTIONS_FEATURE_FLAG,
      batch
    );
    logger.info(
      { processed: offset + batch.length },
      "Enabled frames_v2_functions for batch"
    );
  }
});
