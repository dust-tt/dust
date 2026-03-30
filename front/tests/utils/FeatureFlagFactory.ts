import { type Authenticator, invalidateFeatureFlagsCache } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export class FeatureFlagFactory {
  static async basic(auth: Authenticator, featureName: WhitelistableFeature) {
    await FeatureFlagResource.enable(
      auth.getNonNullableWorkspace(),
      featureName
    );

    // Clear the memoizer cache so that the following calls see the updated feature flags.
    invalidateFeatureFlagsCache(auth);
  }
}
