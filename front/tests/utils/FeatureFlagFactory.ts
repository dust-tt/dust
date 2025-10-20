import { getFeatureFlags } from "@app/lib/auth";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import type { WhitelistableFeature, WorkspaceType } from "@app/types";

export class FeatureFlagFactory {
  static async basic(
    featureName: WhitelistableFeature,
    workspace: WorkspaceType
  ) {
    getFeatureFlags.reset();

    return FeatureFlag.create({
      name: featureName,
      workspaceId: workspace.id,
    });
  }
}
