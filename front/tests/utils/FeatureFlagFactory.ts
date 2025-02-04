import type { WhitelistableFeature, WorkspaceType } from "@dust-tt/types";

import { FeatureFlag } from "@app/lib/models/feature_flag";

export class FeatureFlagFactory {
  static async basic(
    featureName: WhitelistableFeature,
    workspace: WorkspaceType
  ) {
    return FeatureFlag.create({
      name: featureName,
      workspaceId: workspace.id,
    });
  }
}
