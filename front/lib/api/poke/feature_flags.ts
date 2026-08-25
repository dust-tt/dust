import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { FeatureFlagStage } from "@app/types/shared/feature_flags";
import {
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { isString } from "@app/types/shared/utils/general";

// Type cast to enable cross-workspace queries for poke super-admin.
const FeatureFlagModelWithBypass: ModelStaticWorkspaceAware<FeatureFlagModel> =
  FeatureFlagModel;

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
  // `count` does not go through the workspace-isolation find hook, so this cross-workspace
  // aggregate needs no bypass.
  const [countRows, globalFlags] = await Promise.all([
    FeatureFlagModel.count({ group: ["name"] }),
    GlobalFeatureFlagResource.listAll(),
  ]);

  const countByName = new Map<string, number>();
  for (const row of countRows) {
    const { name } = row;
    if (isString(name)) {
      countByName.set(name, row.count);
    }
  }

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
    FeatureFlagModelWithBypass.findAll({
      // WORKSPACE_ISOLATION_BYPASS: poke super-admin listing every workspace a flag is enabled on.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      where: { name },
      include: [{ model: WorkspaceModel, as: "workspace", required: true }],
      order: [["createdAt", "DESC"]],
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
      ? await FeatureFlagModel.count({ where: { name } })
      : flags.length;

  const subscriptionByWorkspaceModelId =
    await SubscriptionResource.fetchActiveByWorkspacesModelId(
      flags.map((flag) => flag.workspaceId)
    );

  return {
    globalRolloutPercentage,
    workspaces: flags.map((flag) => ({
      workspaceId: flag.workspace.sId,
      workspaceName: flag.workspace.name,
      planCode: subscriptionByWorkspaceModelId[flag.workspaceId].getPlan().code,
      enabledAt: flag.createdAt.toISOString(),
    })),
    totalCount,
  };
}
