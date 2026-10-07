import { listGlobalFeatureFlagOptions } from "@app/lib/api/poke/plugins/global/toggle_global_feature_flag";
import { createPlugin } from "@app/lib/api/poke/types";
import { config } from "@app/lib/api/regions/config";
import {
  FEATURE_FLAG_CONDITION_NAMES,
  isFeatureFlagCondition,
} from "@app/lib/feature_flag_conditions";
import { getRegionDisplay } from "@app/lib/poke/regions";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import { Err, Ok } from "@app/types/shared/result";

export const setGlobalFeatureFlagConditionsPlugin = createPlugin({
  manifest: {
    id: "set-global-feature-flag-conditions",
    name: "Set Global Feature Flag Conditions",
    description:
      "Restrict a global feature flag to workspaces meeting all selected conditions " +
      `in ${getRegionDisplay(config.getCurrentRegion())}. ` +
      "Selecting none removes the restriction. A flag without a global rollout is created at 0%, " +
      "so set conditions before raising the percentage.\n" +
      "WARNING: Don't forget to apply for all regions!",
    resourceTypes: ["global"],
    args: {
      feature: {
        type: "enum",
        label: "Feature Flag",
        description: "Select the feature flag to restrict",
        async: true,
        values: [],
        multiple: false,
      },
      conditions: {
        type: "enum",
        label: "Conditions",
        description:
          "Only workspaces meeting all selected conditions are eligible to the global rollout.",
        async: true,
        values: [],
        multiple: true,
      },
    },
    requiredRoles: ["engineering"],
  },
  populateAsyncArgs: async () => {
    return new Ok({
      feature: await listGlobalFeatureFlagOptions(),
      conditions: FEATURE_FLAG_CONDITION_NAMES.map((condition) => ({
        label: condition,
        value: condition,
      })),
    });
  },
  execute: async (_, __, args) => {
    const feature = args.feature[0];
    if (!feature || !isWhitelistableFeature(feature)) {
      return new Err(new Error("Invalid feature flag name."));
    }

    const conditions = args.conditions.filter(isFeatureFlagCondition);
    if (conditions.length !== args.conditions.length) {
      return new Err(new Error("Invalid condition."));
    }

    await GlobalFeatureFlagResource.setConditions(feature, conditions);

    return new Ok({
      display: "text",
      value:
        conditions.length > 0
          ? `Global feature flag "${feature}" restricted to workspaces meeting: ${conditions.join(", ")}.`
          : `Global feature flag "${feature}" has no conditions.`,
    });
  },
});
