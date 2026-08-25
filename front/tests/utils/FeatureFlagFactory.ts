import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export class FeatureFlagFactory {
  static async basic(auth: Authenticator, featureName: WhitelistableFeature) {
    await FeatureFlagResource.enable(
      auth.getNonNullableWorkspace(),
      featureName
    );
  }

  // Insert a flag row whose name is no longer declared in
  // WHITELISTABLE_FEATURES_CONFIG. The cast is the point of the factory: it creates the exact
  // state the type system forbids, so that code handling leftover rows can be tested.
  static async legacy(auth: Authenticator, featureName: string) {
    await FeatureFlagResource.enable(
      auth.getNonNullableWorkspace(),
      featureName as WhitelistableFeature
    );
  }
}
