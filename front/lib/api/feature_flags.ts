import type { WhitelistableFeature, WorkspaceType } from "@dust-tt/types";

import { FeatureFlag } from "@app/lib/models/feature_flag";

export async function isFeatureEnabled(
  owner: WorkspaceType,
  feature: WhitelistableFeature
): Promise<boolean> {
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
  const flags = await FeatureFlag.findAll({
    where: {
      workspaceId: owner.id,
    },
  });

  return flags.map((flag) => flag.name);
}
