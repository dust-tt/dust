import { createPlugin } from "@app/lib/api/poke/types";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import {
  FEATURE_FLAG_STAGE_LABELS,
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { Err, Ok } from "@app/types/shared/result";

export const toggleGlobalFeatureFlagPlugin = createPlugin({
  manifest: {
    id: "toggle-global-feature-flag",
    name: "Toggle Global Feature Flag",
    description:
      "Set a global feature flag with a rollout percentage (0-100). " +
      "Setting 0 removes the global flag. Setting 100 enables it for all workspaces. " +
      "Workspace-level flags always take precedence.",
    resourceTypes: ["global"],
    args: {
      feature: {
        type: "enum",
        label: "Feature Flag",
        description: "Select the feature flag to configure globally",
        async: true,
        values: [],
        multiple: false,
      },
      rolloutPercentage: {
        type: "number",
        label: "Rollout Percentage (0-100)",
        description:
          "Percentage of workspaces to enable this flag for. 0 = off (removes global flag), 100 = on for all.",
      },
    },
  },
  populateAsyncArgs: async () => {
    const globalFlags = await GlobalFeatureFlagResource.listAll();
    const globalFlagMap = new Map(
      globalFlags.map((f) => [f.name, f.rolloutPercentage])
    );

    const sortedFeatures = [...WHITELISTABLE_FEATURES].sort((a, b) => {
      const configA = WHITELISTABLE_FEATURES_CONFIG[a];
      const configB = WHITELISTABLE_FEATURES_CONFIG[b];
      if (configA.stage !== configB.stage) {
        return configB.stage.localeCompare(configA.stage);
      }
      return a.localeCompare(b);
    });

    return new Ok({
      feature: sortedFeatures.map((feature) => {
        const config = WHITELISTABLE_FEATURES_CONFIG[feature];
        const globalPct = globalFlagMap.get(feature);
        const globalLabel =
          globalPct !== undefined ? ` [Global: ${globalPct}%]` : "";
        return {
          label: `[${FEATURE_FLAG_STAGE_LABELS[config.stage]}] ${feature}${globalLabel}`,
          value: feature,
        };
      }),
    });
  },
  execute: async (_, __, args) => {
    const featureName = args.feature[0];
    if (!featureName || !isWhitelistableFeature(featureName)) {
      return new Err(new Error("Invalid feature flag name."));
    }
    const feature: WhitelistableFeature = featureName;

    const rolloutPercentage = args.rolloutPercentage;
    if (
      !Number.isInteger(rolloutPercentage) ||
      rolloutPercentage < 0 ||
      rolloutPercentage > 100
    ) {
      return new Err(
        new Error("Rollout percentage must be an integer between 0 and 100.")
      );
    }

    await GlobalFeatureFlagResource.setRolloutPercentage(
      feature,
      rolloutPercentage
    );

    if (rolloutPercentage === 0) {
      return new Ok({
        display: "text",
        value: `Global feature flag "${feature}" has been removed.`,
      });
    }

    return new Ok({
      display: "text",
      value: `Global feature flag "${feature}" set to ${rolloutPercentage}% rollout.`,
    });
  },
});
