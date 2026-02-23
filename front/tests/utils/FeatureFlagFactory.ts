import { getFeatureFlags } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { WorkspaceType } from "@app/types/user";

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
