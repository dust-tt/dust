import { listFeatureFlagUsage } from "@app/lib/api/poke/feature_flags";
import { createPlugin } from "@app/lib/api/poke/types";
import { config } from "@app/lib/api/regions/config";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import { Err, Ok } from "@app/types/shared/result";

export const deleteLegacyFeatureFlagPlugin = createPlugin({
  manifest: {
    id: "delete-legacy-feature-flag",
    name: "Delete Legacy Feature Flag",
    description:
      "Delete every feature flag row for a flag that no longer exists in the codebase, " +
      `in ${getRegionDisplay(config.getCurrentRegion())}. ` +
      "Only flags absent from WHITELISTABLE_FEATURES are listed; to turn off a flag that still " +
      "exists, use Toggle Feature Flag or Toggle Global Feature Flag instead.\n" +
      "WARNING: Don't forget to apply for all regions!",
    resourceTypes: ["global"],
    args: {
      feature: {
        type: "enum",
        label: "Legacy Feature Flag",
        description: "Select the leftover feature flag whose rows to delete",
        async: true,
        values: [],
        multiple: false,
      },
    },
    warning: "This is a destructive action.",
    requiredRoles: ["engineering"],
  },
  populateAsyncArgs: async () => {
    const featureFlags = await listFeatureFlagUsage();

    // A `null` stage marks a name that is no longer in WHITELISTABLE_FEATURES_CONFIG.
    const legacyFlags = featureFlags.filter((flag) => flag.stage === null);

    return new Ok({
      feature: legacyFlags.map((flag) => ({
        label: `${flag.name} (${flag.workspaceCount} workspace(s))`,
        value: flag.name,
      })),
    });
  },
  execute: async (_, __, args) => {
    const feature = args.feature[0];
    if (!feature) {
      return new Err(new Error("No feature flag selected."));
    }

    if (isWhitelistableFeature(feature)) {
      return new Err(
        new Error(
          `"${feature}" still exists in the codebase. Use Toggle Feature Flag or ` +
            "Toggle Global Feature Flag instead."
        )
      );
    }

    const deleted = await FeatureFlagResource.deleteLegacyByName(feature);

    return new Ok({
      display: "text",
      value: `Deleted ${deleted} row(s) for legacy feature flag "${feature}".`,
    });
  },
});
