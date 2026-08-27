import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { FeatureFlagStage } from "@app/types/shared/feature_flags";
import {
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";

// A flag enabled on more workspaces than this is truncated in the detail view: the point of the
// page is to read the list, and past a few thousand rows the payload matters more than the tail.
export const MAX_WORKSPACES_PER_FEATURE_FLAG = 2000;

export interface PokeFeatureFlagUsage {
  name: string;
  // `null` for flag rows whose name is no longer in WHITELISTABLE_FEATURES_CONFIG.
  description: string | null;
  stage: FeatureFlagStage | null;
  workspaceCount: number;
  globalRolloutPercentage: number | null;
}

export interface PokeFeatureFlagWorkspace {
  workspaceId: string;
  workspaceName: string;
  planCode: string;
  enabledAt: string;
}

export interface GetPokeFeatureFlagsResponseBody {
  featureFlags: PokeFeatureFlagUsage[];
}

export interface GetPokeFeatureFlagWorkspacesResponseBody {
  globalRolloutPercentage: number | null;
  workspaces: PokeFeatureFlagWorkspace[];
  totalCount: number;
}

/**
 * Aggregate, for every known feature flag, the number of workspaces it is enabled on, plus its
 * global rollout percentage. Flags with no workspace row are reported with a count of 0, and rows
 * whose name is no longer in WHITELISTABLE_FEATURES_CONFIG are reported as stage-less entries:
 * they are filtered out everywhere else, and are what `delete_legacy_feature_flag.ts` cleans up.
 */
export async function listFeatureFlagUsage(): Promise<PokeFeatureFlagUsage[]> {
  const [countByName, globalFlags] = await Promise.all([
    FeatureFlagResource.countByFlagNameForAllWorkspaces(),
    GlobalFeatureFlagResource.listAll(),
  ]);

  const rolloutByName = new Map(
    globalFlags.map((flag) => [flag.name, flag.rolloutPercentage])
  );

  const configuredFlags: PokeFeatureFlagUsage[] = WHITELISTABLE_FEATURES.map(
    (name) => ({
      name,
      description: WHITELISTABLE_FEATURES_CONFIG[name].description,
      stage: WHITELISTABLE_FEATURES_CONFIG[name].stage,
      workspaceCount: countByName.get(name) ?? 0,
      globalRolloutPercentage: rolloutByName.get(name) ?? null,
    })
  );

  const legacyFlags: PokeFeatureFlagUsage[] = [...countByName.entries()]
    .filter(([name]) => !isWhitelistableFeature(name))
    .map(([name, workspaceCount]) => ({
      name,
      description: null,
      stage: null,
      workspaceCount,
      globalRolloutPercentage: null,
    }));

  return [...configuredFlags, ...legacyFlags];
}

/**
 * List the workspaces a feature flag is enabled on, most recently enabled first, capped at
 * MAX_WORKSPACES_PER_FEATURE_FLAG. `totalCount` reports the untruncated total.
 */
export async function listWorkspacesForFeatureFlag(
  name: string
): Promise<GetPokeFeatureFlagWorkspacesResponseBody> {
  const [flags, globalFlags] = await Promise.all([
    FeatureFlagResource.dangerouslyListForAllWorkspacesByName(name, {
      limit: MAX_WORKSPACES_PER_FEATURE_FLAG,
    }),
    GlobalFeatureFlagResource.listAll(),
  ]);

  const globalRolloutPercentage =
    globalFlags.find((flag) => flag.name === name)?.rolloutPercentage ?? null;

  if (flags.length === 0) {
    return { globalRolloutPercentage, workspaces: [], totalCount: 0 };
  }

  // Only pay for the count query when the list is actually truncated.
  const totalCount =
    flags.length === MAX_WORKSPACES_PER_FEATURE_FLAG
      ? await FeatureFlagResource.countForAllWorkspacesByName(name)
      : flags.length;

  const workspaceModelIds = flags.map((flag) => flag.workspaceId);
  const [workspaces, subscriptionByWorkspaceModelId] = await Promise.all([
    WorkspaceResource.fetchByModelIds(workspaceModelIds),
    SubscriptionResource.fetchActiveByWorkspacesModelId(workspaceModelIds),
  ]);

  const workspaceByModelId = new Map(
    workspaces.map((workspace) => [workspace.id, workspace])
  );

  return {
    globalRolloutPercentage,
    workspaces: flags.map((flag) => {
      const workspace = workspaceByModelId.get(flag.workspaceId);
      if (!workspace) {
        throw new Error(
          `Workspace ${flag.workspaceId} not found for feature flag "${name}".`
        );
      }

      return {
        workspaceId: workspace.sId,
        workspaceName: workspace.name,
        planCode:
          subscriptionByWorkspaceModelId[flag.workspaceId].getPlan().code,
        enabledAt: flag.createdAt.toISOString(),
      };
    }),
    totalCount,
  };
}
