import { createPlugin } from "@app/lib/api/poke/types";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import type { EnumValue, WhitelistableFeature } from "@app/types";
import { mapToEnumValues, Ok } from "@app/types";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";

function convertFeatureFlagToEnumValue(
  featureFlag: WhitelistableFeature
): EnumValue {
  return {
    label: featureFlag,
    value: featureFlag,
    checked: false,
  };
}

export const toggleFeatureFlagPlugin = createPlugin({
  manifest: {
    id: "toggle-feature-flag",
    name: "Toggle Feature Flag",
    description:
      "Toggle a specific feature flag ON/OFF for this workspace. Use the table below to see " +
      "current status.",
    resourceTypes: ["workspaces"],
    args: {
      feature: {
        type: "enum",
        label: "Feature Flag",
        description: "Select which feature flag you want to enable/disable",
        async: true,
        values: mapToEnumValues(
          WHITELISTABLE_FEATURES,
          convertFeatureFlagToEnumValue
        ),
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const enabledFlags = await FeatureFlag.findAll({
      where: {
        workspaceId: workspace.id,
      },
    });

    const enabledFlagNames = new Set(enabledFlags.map((flag) => flag.name));

    return new Ok({
      feature: WHITELISTABLE_FEATURES.map((feature) => ({
        label: feature,
        value: feature,
        checked: enabledFlagNames.has(feature),
      })),
    });
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const feature = args.feature as WhitelistableFeature;

    // Check if the feature flag is currently enabled.
    const existingFlag = await FeatureFlag.findOne({
      where: {
        workspaceId: workspace.id,
        name: feature,
      },
    });

    if (existingFlag) {
      // Feature is enabled, disable it.
      await existingFlag.destroy();

      return new Ok({
        display: "text",
        value: `✅ Feature "${feature}" has been DISABLED for workspace "${workspace.name}".`,
      });
    } else {
      // Feature is disabled, enable it.
      await FeatureFlag.create({
        workspaceId: workspace.id,
        name: feature,
      });

      return new Ok({
        display: "text",
        value: `✅ Feature "${feature}" has been ENABLED for workspace "${workspace.name}".`,
      });
    }
  },
});
