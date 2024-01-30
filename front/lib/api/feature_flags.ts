import type { WhitelistableFeature, WorkspaceType } from "@dust-tt/types";
import { WHITELISTABLE_FEATURES } from "@dust-tt/types";

import { isDevelopment } from "@app/lib/development";
import { FeatureFlag } from "@app/lib/models/feature_flag";

const { ACTIVATE_ALL_FEATURES_DEV = true } = process.env;

export async function isFeatureEnabled(
  owner: WorkspaceType,
  feature: WhitelistableFeature
): Promise<boolean> {
  if (ACTIVATE_ALL_FEATURES_DEV && isDevelopment()) {
    return true;
  }
  return !!(await FeatureFlag.count({
    where: {
      workspaceId: owner.id,
      name: feature,
    },
  }));
}

export async function getFeatureFlags(
  owner: WorkspaceType
): Promise<WhitelistableFeature[]> {
  if (ACTIVATE_ALL_FEATURES_DEV && isDevelopment()) {
    return [...WHITELISTABLE_FEATURES];
  }
  const flags = await FeatureFlag.findAll({
    where: {
      workspaceId: owner.id,
    },
  });
  return flags.map((flag) => flag.name);
}
