import { createPlugin } from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { invalidateFeatureFlagsCache } from "@app/lib/auth";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import {
  FEATURE_FLAG_STAGE_LABELS,
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";

export const toggleFeatureFlagPlugin = createPlugin({
  manifest: {
    id: "toggle-feature-flag",
    name: "Toggle Feature Flag",
    description:
      "Toggle feature flags ON/OFF for this workspace. Flags marked [Global: N%] are enabled via " +
      "global rollout. Use the toggle below to switch between batch workspace-wide mode and group-scoped mode.",
    resourceTypes: ["workspaces"],
    args: {
      scopeToGroups: {
        type: "boolean",
        label: "Scope to specific groups?",
        description:
          "Enable to set a single flag for specific groups instead of batch toggling.",
      },
      features: {
        type: "enum",
        label: "Feature Flags",
        description: "Select which feature flags you want to enable/disable.",
        async: true,
        values: [],
        multiple: true,
        dependsOn: { field: "scopeToGroups", value: false },
      },
      feature: {
        type: "enum",
        label: "Feature Flag",
        description: "The feature flag to scope to groups.",
        async: true,
        values: [],
        multiple: false,
        dependsOn: { field: "scopeToGroups", value: true },
      },
      groups: {
        type: "enum",
        label: "Groups (leave empty for workspace-wide)",
        description:
          "Select which groups should have this flag. Leave empty for all users.",
        async: true,
        values: [],
        multiple: true,
        dependsOn: { field: "scopeToGroups", value: true },
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();
    const [enabledFlags, globalFlags] = await Promise.all([
      FeatureFlagResource.listForWorkspace(workspace),
      GlobalFeatureFlagResource.listAll(),
    ]);

    const enabledFlagNames = new Set(enabledFlags.map((flag) => flag.name));
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

    const featureOptions = sortedFeatures.map((f) => {
      const config = WHITELISTABLE_FEATURES_CONFIG[f];
      return {
        label: `[${FEATURE_FLAG_STAGE_LABELS[config.stage]}] ${f}`,
        value: f,
      };
    });

    const workspaceGroups = await GroupResource.listAllWorkspaceGroups(auth, {
      groupKinds: ["global", "regular", "provisioned"],
    });

    return new Ok({
      features: sortedFeatures.map((feature) => {
        const config = WHITELISTABLE_FEATURES_CONFIG[feature];
        const globalPct = globalFlagMap.get(feature);
        const globalLabel =
          globalPct !== undefined ? ` [Global: ${globalPct}%]` : "";
        return {
          label: `[${FEATURE_FLAG_STAGE_LABELS[config.stage]}] ${feature}${globalLabel}`,
          value: feature,
          checked: enabledFlagNames.has(feature),
        };
      }),
      feature: featureOptions,
      groups: workspaceGroups.map((g) => ({
        label: `${g.name} (${g.kind})`,
        value: g.id.toString(),
      })),
    });
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();

    if (args.scopeToGroups) {
      return executeGroupScoped(auth, workspace, args);
    }

    return executeWorkspaceWide(auth, workspace, args);
  },
});

async function executeWorkspaceWide(
  auth: Authenticator,
  workspace: WorkspaceType,
  args: { features: string[] }
) {
  const existingFlags = await FeatureFlagResource.listForWorkspace(workspace);
  const featureFlags = args.features.filter(
    (feature): feature is WhitelistableFeature =>
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

  // Bust the server-side memoizer cache on this pod so subsequent SSR
  // requests hitting it immediately reflect the updated flags. Other pods
  // will pick up the change once their 3s memoizer TTL expires.
  if (toAdd.length > 0 || toRemove.length > 0) {
    invalidateFeatureFlagsCache(auth);
  }

  const actions: string[] = [];

  for (const feature of toAdd) {
    actions.push(
      `✅ Feature "${feature}" has been ENABLED for workspace "${workspace.name}"`
    );
  }
  for (const feature of toRemove) {
    // Do not show a message for features that might have been set in the
    // past but no longer exist as it might freak out the poke user.
    if (isWhitelistableFeature(feature)) {
      actions.push(
        `❌ Feature "${feature}" has been DISABLED for workspace "${workspace.name}"`
      );
    }
  }

  return new Ok({
    display: "markdown" as const,
    value: actions.join("\n\n"),
  });
}

async function executeGroupScoped(
  auth: Authenticator,
  workspace: WorkspaceType,
  args: { feature: string[]; groups: string[] }
) {
  const featureName = args.feature[0];

  if (!featureName || !isWhitelistableFeature(featureName)) {
    return new Err(new Error("Invalid feature flag selected."));
  }

  const selectedGroupIds = args.groups
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id));

  // Check if the flag already exists.
  const existingFlags = await FeatureFlagResource.listForWorkspace(workspace);
  const existingFlag = existingFlags.find((f) => f.name === featureName);

  if (existingFlag) {
    // Update the existing flag's groupIds in place.
    await FeatureFlagModel.update(
      { groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : null },
      { where: { workspaceId: workspace.id, name: featureName } }
    );
  } else {
    // Create a new flag.
    await FeatureFlagResource.enable(workspace, featureName, {
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    });
  }

  invalidateFeatureFlagsCache(auth);

  // Resolve group names for the confirmation message.
  const groupNames: string[] = [];
  if (selectedGroupIds.length > 0) {
    const groups = await GroupResource.fetchByModelIds(auth, selectedGroupIds);
    for (const g of groups) {
      groupNames.push(g.name);
    }
  }

  const scopeDescription =
    selectedGroupIds.length > 0
      ? `groups: **${groupNames.join(", ")}**`
      : "**all users** (workspace-wide)";

  const action = existingFlag ? "Updated" : "Enabled";

  return new Ok({
    display: "markdown" as const,
    value: `${action} feature flag **${featureName}** for ${scopeDescription} in workspace "${workspace.name}".`,
  });
}
