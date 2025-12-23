import { createPlugin } from "@app/lib/api/poke/types";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { Ok } from "@app/types";
import {
  FEATURE_FLAG_STAGE_LABELS,
  isWhitelistableFeature,
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
      features: {
        type: "enum",
        label: "Feature Flags",
        description: "Select which feature flags you want to enable/disable",
        async: true,
        values: [],
        multiple: true,
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const enabledFlags = await FeatureFlagResource.listForWorkspace(workspace);

    const enabledFlagNames = new Set(enabledFlags.map((flag) => flag.name));

    const sortedFeatures = WHITELISTABLE_FEATURES.sort((a, b) => {
      const configA = WHITELISTABLE_FEATURES_CONFIG[a];
      const configB = WHITELISTABLE_FEATURES_CONFIG[b];
      if (configA.stage !== configB.stage) {
        return configB.stage.localeCompare(configA.stage);
      }
      return a.localeCompare(b);
    });

    return new Ok({
      features: sortedFeatures.map((feature) => {
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
    const existingFlags = await FeatureFlagResource.listForWorkspace(workspace);
    const featureFlags = args.features.filter((feature) =>
      isWhitelistableFeature(feature)
    );

    const toAdd = featureFlags.filter(
      (feature) => !existingFlags.some((flag) => flag.name === feature)
    );
    const toRemove = existingFlags
      .filter((flag) => !featureFlags.includes(flag.name))
      .map((flag) => flag.name);

    if (toAdd.length > 0) {
      await FeatureFlagResource.enableMany(workspace, toAdd);
    }
    if (toRemove.length > 0) {
      await FeatureFlagResource.disableMany(workspace, toRemove);
    }

    const actions: string[] = [];

    for (const feature of toAdd) {
      actions.push(
        `✅ Feature "${feature}" has been ENABLED for workspace "${workspace.name}"`
      );
    }
    for (const feature of toRemove) {
      // Do not show a message for features that might have be set in the past but no longer exist as it might freak out the poke user.
      if (isWhitelistableFeature(feature)) {
        actions.push(
          `❌ Feature "${feature}" has been DISABLED for workspace "${workspace.name}"`
        );
      }
    }

    return new Ok({
      display: "markdown",
      value: actions.join("\n\n"),
    });
  },
});
