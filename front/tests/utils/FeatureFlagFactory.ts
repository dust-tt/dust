import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { WhitelistableFeature, WorkspaceType } from "@app/types";

export class FeatureFlagFactory {
  static async basic(
    featureName: WhitelistableFeature,
    workspace: WorkspaceType
  ) {
    return FeatureFlagResource.enable(workspace, featureName);
  }
}
