import type { WhitelistableFeature } from "@dust-tt/types";

import { FeatureFlag } from "@app/lib/models/feature_flag";
import type { Workspace } from "@app/lib/models/workspace";

export class FeatureFlagFactory {
  static async basic(featureName: WhitelistableFeature, workspace: Workspace) {
    return FeatureFlag.create({
      name: featureName,
      workspaceId: workspace.id,
    });
  }
}
