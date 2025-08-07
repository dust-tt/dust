import { createPlugin } from "@app/lib/api/poke/types";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import type { WhitelistableFeature } from "@app/types";
import { Ok } from "@app/types";
import {
  FEATURE_FLAG_STAGE_LABELS,
  WHITELISTABLE_FEATURES,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";

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
        values: [],
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
      feature: WHITELISTABLE_FEATURES.map((feature) => {
        const config = WHITELISTABLE_FEATURES_CONFIG[feature];
        return {
          label: `[${FEATURE_FLAG_STAGE_LABELS[config.stage]}] ${feature} `,
          value: feature,
          checked: enabledFlagNames.has(feature),
        };
      }),
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
