import { FeatureFlag } from "@app/lib/models/feature_flag";
import type { WhitelistableFeature, WorkspaceType } from "@app/types";

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
