import { getFeatureFlags } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { WhitelistableFeature, WorkspaceType } from "@app/types";

export class FeatureFlagFactory {
  static async basic(
    featureName: WhitelistableFeature,
    workspace: WorkspaceType
  ) {
    await FeatureFlagResource.enable(workspace, featureName);

    // Clear the memoizer cache so that the following calls see the updated feature flags.
    getFeatureFlags.del(workspace);
  }
}
