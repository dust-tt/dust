import { type Authenticator, invalidateFeatureFlagsCache } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

import type { ModelId } from "@app/types/shared/model_id";

export class FeatureFlagFactory {
  static async basic(
    auth: Authenticator,
    featureName: WhitelistableFeature,
    { groupIds }: { groupIds?: ModelId[] } = {}
  ) {
    await FeatureFlagResource.enable(
      auth.getNonNullableWorkspace(),
      featureName,
      { groupIds }
    );

    // Clear the memoizer cache so that the following calls see the updated feature flags.
    invalidateFeatureFlagsCache(auth);
  }
}
