import { createPlugin } from "@app/lib/api/poke/types";
import { config } from "@app/lib/api/regions/config";
import {
  FEATURE_FLAG_CONDITION_NAMES,
  isFeatureFlagCondition,
} from "@app/lib/feature_flag_conditions";
import {
  formatGlobalRollout,
  NO_FEATURE_FLAG_CONDITION,
} from "@app/lib/poke/feature_flags";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import type { EnumValue } from "@app/types/poke/plugins";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import {
  FEATURE_FLAG_STAGE_LABELS,
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { Err, Ok } from "@app/types/shared/result";

async function listGlobalFeatureFlagOptions(): Promise<EnumValue[]> {
  const globalFlags = await GlobalFeatureFlagResource.listAll();
  const globalFlagMap = new Map(globalFlags.map((f) => [f.name, f]));

  const sortedFeatures = [...WHITELISTABLE_FEATURES].sort((a, b) => {
    const configA = WHITELISTABLE_FEATURES_CONFIG[a];
    const configB = WHITELISTABLE_FEATURES_CONFIG[b];
    if (configA.stage !== configB.stage) {
      return configB.stage.localeCompare(configA.stage);
    }
    return a.localeCompare(b);
  });

  return sortedFeatures.map((feature) => {
    const config = WHITELISTABLE_FEATURES_CONFIG[feature];
    const globalFlag = globalFlagMap.get(feature);
    const globalLabel = globalFlag
      ? ` [Global: ${formatGlobalRollout(globalFlag.rolloutPercentage, globalFlag.condition)}]`
      : "";
    return {
      label: `[${FEATURE_FLAG_STAGE_LABELS[config.stage]}] ${feature} (@${config.owner})${globalLabel}`,
      value: feature,
    };
  });
}

export const toggleGlobalFeatureFlagPlugin = createPlugin({
  manifest: {
    id: "toggle-global-feature-flag",
    name: "Toggle Global Feature Flag",
    description:
      "Set a global feature flag with a rollout percentage (0-100) " +
      `in ${getRegionDisplay(config.getCurrentRegion())}. ` +
      "Only workspaces meeting the selected condition are eligible. Setting 0 removes the " +
      "global flag. Setting 100 enables it for all eligible workspaces. " +
      "Workspace-level flags always take precedence.\n" +
      "WARNING: Don't forget to apply for all regions!",
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
      condition: {
        type: "enum",
        label: "Condition",
        description:
          "Only workspaces meeting this condition are eligible. Replaces the flag's current condition.",
        async: true,
        values: [],
        multiple: false,
      },
    },
    requiredRoles: ["engineering"],
  },
  populateAsyncArgs: async () => {
    return new Ok({
      feature: await listGlobalFeatureFlagOptions(),
      condition: [
        { label: "None", value: NO_FEATURE_FLAG_CONDITION, checked: true },
        ...FEATURE_FLAG_CONDITION_NAMES.map((condition) => ({
          label: condition,
          value: condition,
        })),
      ],
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

    const selectedCondition = args.condition[0] ?? NO_FEATURE_FLAG_CONDITION;
    const condition =
      selectedCondition === NO_FEATURE_FLAG_CONDITION
        ? null
        : selectedCondition;
    if (condition !== null && !isFeatureFlagCondition(condition)) {
      return new Err(new Error("Invalid condition."));
    }

    await GlobalFeatureFlagResource.setRolloutPercentage(
      feature,
      rolloutPercentage,
      condition
    );

    if (rolloutPercentage === 0) {
      return new Ok({
        display: "text",
        value: `Global feature flag "${feature}" has been removed.`,
      });
    }

    return new Ok({
      display: "text",
      value: `Global feature flag "${feature}" set to ${formatGlobalRollout(rolloutPercentage, condition)} rollout.`,
    });
  },
});
