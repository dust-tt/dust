import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import {
  type AutoInternalMCPServerNameType,
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  INTERNAL_MCP_SERVERS,
  isAutoInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  Authenticator,
  invalidateFeatureFlagsCache,
  invalidateGlobalFeatureFlagsCache,
} from "@app/lib/auth";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import { errorToString } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { Context } from "@temporalio/activity";
import { Op } from "sequelize";

import { DEFAULT_WORKSPACE_CONCURRENCY } from "./config";

type SpaceKindForDefaultMCPViews = "system" | "global";

export type EnsureMCPServerViewsWorkflowTrigger = {
  triggeringFeature?: WhitelistableFeature;
  previousRolloutPercentage?: number;
  rolloutPercentage?: number;
};

export type AffectedMCPServerViewsWorkspace = {
  workspaceModelId: ModelId;
  workspaceId: string;
};

export type GetAffectedMCPServerViewsWorkspaceBatchActivityArgs =
  EnsureMCPServerViewsWorkflowTrigger & {
    lastProcessedWorkspaceModelId?: ModelId;
    batchSize: number;
  };

export type GetAffectedMCPServerViewsWorkspaceBatchActivityResult = {
  scannedWorkspacesCount: number;
  affectedWorkspaces: AffectedMCPServerViewsWorkspace[];
  lastScannedWorkspaceModelId: ModelId | null;
  hasMore: boolean;
};

export type EnsureMCPServerViewsForWorkspaceBatchActivityArgs = {
  workspaces: AffectedMCPServerViewsWorkspace[];
  concurrency?: number;
};

export type EnsureMCPServerViewsWorkspaceFailure = {
  workspaceId: string;
  error: string;
};

export type EnsureMCPServerViewsForWorkspaceBatchActivityResult = {
  processedWorkspacesCount: number;
  createdViewsCount: number;
  failures: EnsureMCPServerViewsWorkspaceFailure[];
};

export type EnsureMCPServerViewsWorkflowSummary = {
  scannedWorkspacesCount: number;
  affectedWorkspacesCount: number;
  processedWorkspacesCount: number;
  createdViewsCount: number;
  failuresCount: number;
  failureSamples: EnsureMCPServerViewsWorkspaceFailure[];
};

type AutoMCPServerFeatureFlagHint = {
  feature: WhitelistableFeature;
  serverNames: AutoInternalMCPServerNameType[];
};

const AUTO_MCP_SERVER_FEATURE_FLAG_HINTS = [
  { feature: "legacy_dust_apps", serverNames: ["run_dust_app"] },
  { feature: "slideshow", serverNames: ["slideshow"] },
  { feature: "sandbox_tools", serverNames: ["sandbox"] },
  { feature: "plan_mode", serverNames: ["plan_mode"] },
] satisfies AutoMCPServerFeatureFlagHint[];

// SQL pre-filter hints only. The resource method remains the source of truth.
const FEATURE_FLAG_BY_AUTO_MCP_SERVER_NAME = new Map<
  AutoInternalMCPServerNameType,
  WhitelistableFeature
>();
for (const hint of AUTO_MCP_SERVER_FEATURE_FLAG_HINTS) {
  for (const serverName of hint.serverNames) {
    FEATURE_FLAG_BY_AUTO_MCP_SERVER_NAME.set(serverName, hint.feature);
  }
}

// This server is plan-gated rather than feature-gated. The SQL pre-filter
// intentionally over-selects slightly here; ensureAllAutoToolsAreCreated does
// the authoritative plan check.
const PLAN_GATED_AUTO_MCP_SERVER_NAMES = new Set<AutoInternalMCPServerNameType>(
  ["speech_generator"]
);

const SpaceModelWithBypass: ModelStaticWorkspaceAware<SpaceModel> = SpaceModel;
const FeatureFlagModelWithBypass: ModelStaticWorkspaceAware<FeatureFlagModel> =
  FeatureFlagModel;
const MCPServerViewModelWithBypass: ModelStaticWorkspaceAware<MCPServerViewModel> =
  MCPServerViewModel;

type CandidateAutoMCPServer = {
  name: AutoInternalMCPServerNameType;
  feature?: WhitelistableFeature;
};

type CandidateAutoMCPServerSelection = {
  candidates: CandidateAutoMCPServer[];
  skippedRestrictedAutoServerNames: AutoInternalMCPServerNameType[];
  usedFullScanFallback: boolean;
};

type DefaultSpacesByWorkspace = {
  systemSpaceModelId?: ModelId;
  globalSpaceModelId?: ModelId;
};

type WorkspaceProcessingResult =
  | { status: "success"; workspaceId: string; createdViewsCount: number }
  | { status: "failure"; workspaceId: string; error: string };

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function getFeatureHintedAutoMCPServerNames(
  feature: WhitelistableFeature
): AutoInternalMCPServerNameType[] {
  const hint = AUTO_MCP_SERVER_FEATURE_FLAG_HINTS.find(
    (h) => h.feature === feature
  );
  return hint?.serverNames ?? [];
}

function getAutoMCPServerNames(): AutoInternalMCPServerNameType[] {
  return AVAILABLE_INTERNAL_MCP_SERVER_NAMES.filter(
    isAutoInternalMCPServerName
  );
}

function getBroadCandidateAutoMCPServers(): CandidateAutoMCPServer[] {
  return getAutoMCPServerNames().map((name) => ({
    name,
    feature: FEATURE_FLAG_BY_AUTO_MCP_SERVER_NAME.get(name),
  }));
}

function getCandidateAutoMCPServers({
  triggeringFeature,
}: {
  triggeringFeature?: WhitelistableFeature;
}): CandidateAutoMCPServerSelection {
  if (triggeringFeature) {
    const hintedNames = getFeatureHintedAutoMCPServerNames(triggeringFeature);
    if (hintedNames.length === 0) {
      return {
        candidates: getBroadCandidateAutoMCPServers(),
        skippedRestrictedAutoServerNames: [],
        usedFullScanFallback: true,
      };
    }

    return {
      candidates: hintedNames.map((name) => ({
        name,
        feature: triggeringFeature,
      })),
      skippedRestrictedAutoServerNames: [],
      usedFullScanFallback: false,
    };
  }

  const candidates: CandidateAutoMCPServer[] = [];
  const skippedRestrictedAutoServerNames: AutoInternalMCPServerNameType[] = [];
  for (const name of getAutoMCPServerNames()) {
    if (INTERNAL_MCP_SERVERS[name].isRestricted === undefined) {
      candidates.push({ name });
      continue;
    }

    const feature = FEATURE_FLAG_BY_AUTO_MCP_SERVER_NAME.get(name);
    if (feature) {
      candidates.push({ name, feature });
      continue;
    }

    if (PLAN_GATED_AUTO_MCP_SERVER_NAMES.has(name)) {
      candidates.push({ name });
      continue;
    }

    skippedRestrictedAutoServerNames.push(name);
  }

  return {
    candidates,
    skippedRestrictedAutoServerNames,
    usedFullScanFallback: false,
  };
}

function getFeatureKey({
  workspaceModelId,
  feature,
}: {
  workspaceModelId: ModelId;
  feature: WhitelistableFeature;
}): string {
  return `${workspaceModelId}:${feature}`;
}

function getViewKey({
  workspaceModelId,
  internalMCPServerId,
  spaceModelId,
}: {
  workspaceModelId: ModelId;
  internalMCPServerId: string;
  spaceModelId: ModelId;
}): string {
  return `${workspaceModelId}:${internalMCPServerId}:${spaceModelId}`;
}

function isFeatureEnabledForWorkspace({
  feature,
  workspaceModelId,
  workspaceFeatureKeys,
  globalRolloutByFeature,
  trigger,
}: {
  feature: WhitelistableFeature;
  workspaceModelId: ModelId;
  workspaceFeatureKeys: Set<string>;
  globalRolloutByFeature: Map<WhitelistableFeature, number>;
  trigger: EnsureMCPServerViewsWorkflowTrigger;
}): boolean {
  if (
    workspaceFeatureKeys.has(
      getFeatureKey({
        workspaceModelId,
        feature,
      })
    )
  ) {
    return true;
  }

  if (
    trigger.triggeringFeature === feature &&
    trigger.rolloutPercentage !== undefined
  ) {
    return GlobalFeatureFlagResource.isInRollout(
      workspaceModelId,
      trigger.rolloutPercentage
    );
  }

  const rolloutPercentage = globalRolloutByFeature.get(feature);
  if (rolloutPercentage === undefined) {
    return false;
  }

  return GlobalFeatureFlagResource.isInRollout(
    workspaceModelId,
    rolloutPercentage
  );
}

function isCandidateExpectedForWorkspace({
  candidate,
  workspaceModelId,
  workspaceFeatureKeys,
  globalRolloutByFeature,
  trigger,
}: {
  candidate: CandidateAutoMCPServer;
  workspaceModelId: ModelId;
  workspaceFeatureKeys: Set<string>;
  globalRolloutByFeature: Map<WhitelistableFeature, number>;
  trigger: EnsureMCPServerViewsWorkflowTrigger;
}): boolean {
  if (!candidate.feature) {
    return true;
  }

  return isFeatureEnabledForWorkspace({
    feature: candidate.feature,
    workspaceModelId,
    workspaceFeatureKeys,
    globalRolloutByFeature,
    trigger,
  });
}

function isSuccessResult(
  result: WorkspaceProcessingResult
): result is Extract<WorkspaceProcessingResult, { status: "success" }> {
  return result.status === "success";
}

function isFailureResult(
  result: WorkspaceProcessingResult
): result is Extract<WorkspaceProcessingResult, { status: "failure" }> {
  return result.status === "failure";
}

export async function getAffectedMCPServerViewsWorkspaceBatchActivity({
  lastProcessedWorkspaceModelId = 0,
  batchSize,
  triggeringFeature,
  previousRolloutPercentage,
  rolloutPercentage,
}: GetAffectedMCPServerViewsWorkspaceBatchActivityArgs): Promise<GetAffectedMCPServerViewsWorkspaceBatchActivityResult> {
  const trigger = {
    triggeringFeature,
    previousRolloutPercentage,
    rolloutPercentage,
  };
  const { candidates, skippedRestrictedAutoServerNames, usedFullScanFallback } =
    getCandidateAutoMCPServers({ triggeringFeature });

  if (usedFullScanFallback && lastProcessedWorkspaceModelId === 0) {
    logger.warn(
      {
        triggeringFeature,
        candidates: candidates.map((candidate) => candidate.name),
      },
      "[Ensure MCP Server Views] Triggering feature has no MCP server hint, falling back to broad candidate scan."
    );
  }

  if (
    !triggeringFeature &&
    skippedRestrictedAutoServerNames.length > 0 &&
    lastProcessedWorkspaceModelId === 0
  ) {
    logger.warn(
      { skippedRestrictedAutoServerNames },
      "[Ensure MCP Server Views] Restricted auto MCP servers are not covered by SQL pre-filter hints and will be skipped by the daily scan."
    );
  }

  if (candidates.length === 0) {
    logger.info(
      { triggeringFeature },
      "[Ensure MCP Server Views] No auto MCP server candidates for scan."
    );
    return {
      scannedWorkspacesCount: 0,
      affectedWorkspaces: [],
      lastScannedWorkspaceModelId: lastProcessedWorkspaceModelId,
      hasMore: false,
    };
  }

  const workspaceModels = await WorkspaceModel.findAll({
    attributes: ["id", "sId"],
    where: {
      id: {
        [Op.gt]: lastProcessedWorkspaceModelId,
      },
    },
    order: [["id", "ASC"]],
    limit: batchSize,
  });

  if (workspaceModels.length === 0) {
    return {
      scannedWorkspacesCount: 0,
      affectedWorkspaces: [],
      lastScannedWorkspaceModelId: lastProcessedWorkspaceModelId,
      hasMore: false,
    };
  }

  const workspaceModelIds = workspaceModels.map((workspace) => workspace.id);
  const lastScannedWorkspaceModelId =
    workspaceModels[workspaceModels.length - 1].id;

  const featureNames = Array.from(
    new Set(candidates.map((c) => c.feature).filter(isDefined))
  );

  const [spaceModels, featureFlagModels, globalFeatureFlags] =
    await Promise.all([
      SpaceModelWithBypass.findAll({
        attributes: ["id", "workspaceId", "kind"],
        where: {
          workspaceId: {
            [Op.in]: workspaceModelIds,
          },
          kind: {
            [Op.in]: [
              "system",
              "global",
            ] satisfies SpaceKindForDefaultMCPViews[],
          },
        },
        // WORKSPACE_ISOLATION_BYPASS: Cross-workspace scan to find default spaces missing MCP server views.
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      }),
      featureNames.length > 0
        ? FeatureFlagModelWithBypass.findAll({
            attributes: ["workspaceId", "name"],
            where: {
              workspaceId: {
                [Op.in]: workspaceModelIds,
              },
              name: {
                [Op.in]: featureNames,
              },
            },
            // WORKSPACE_ISOLATION_BYPASS: Cross-workspace scan to evaluate feature-gated MCP server candidates.
            // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
            dangerouslyBypassWorkspaceIsolationSecurity: true,
          })
        : Promise.resolve([]),
      GlobalFeatureFlagResource.listAll(),
    ]);

  const defaultSpacesByWorkspace = new Map<ModelId, DefaultSpacesByWorkspace>();
  for (const space of spaceModels) {
    const current = defaultSpacesByWorkspace.get(space.workspaceId) ?? {};
    switch (space.kind) {
      case "system":
        defaultSpacesByWorkspace.set(space.workspaceId, {
          ...current,
          systemSpaceModelId: space.id,
        });
        break;
      case "global":
        defaultSpacesByWorkspace.set(space.workspaceId, {
          ...current,
          globalSpaceModelId: space.id,
        });
        break;
      default:
        if (isString(space.kind)) {
          logger.warn(
            { workspaceModelId: space.workspaceId, spaceKind: space.kind },
            "[Ensure MCP Server Views] Unexpected default-space scan kind."
          );
        }
    }
  }

  const workspaceFeatureKeys = new Set(
    featureFlagModels.map((flag) =>
      getFeatureKey({
        workspaceModelId: flag.workspaceId,
        feature: flag.name,
      })
    )
  );

  const globalRolloutByFeature = new Map<WhitelistableFeature, number>();
  for (const flag of globalFeatureFlags) {
    if (featureNames.includes(flag.name)) {
      globalRolloutByFeature.set(flag.name, flag.rolloutPercentage);
    }
  }

  const expectedRows = workspaceModels.flatMap((workspace) => {
    const spaces = defaultSpacesByWorkspace.get(workspace.id);
    const systemSpaceModelId = spaces?.systemSpaceModelId;
    const globalSpaceModelId = spaces?.globalSpaceModelId;
    if (!systemSpaceModelId || !globalSpaceModelId) {
      logger.warn(
        { workspaceId: workspace.sId, workspaceModelId: workspace.id },
        "[Ensure MCP Server Views] Workspace missing system or global space during pre-filter."
      );
      return [];
    }

    return candidates
      .filter((candidate) =>
        isCandidateExpectedForWorkspace({
          candidate,
          workspaceModelId: workspace.id,
          workspaceFeatureKeys,
          globalRolloutByFeature,
          trigger,
        })
      )
      .map((candidate) => ({
        workspaceModelId: workspace.id,
        workspaceId: workspace.sId,
        internalMCPServerId: autoInternalMCPServerNameToSId({
          name: candidate.name,
          workspaceId: workspace.id,
        }),
        systemSpaceModelId,
        globalSpaceModelId,
      }));
  });

  if (expectedRows.length === 0) {
    logger.info(
      {
        lastProcessedWorkspaceModelId,
        lastScannedWorkspaceModelId,
        scannedWorkspacesCount: workspaceModels.length,
        candidatesCount: candidates.length,
      },
      "[Ensure MCP Server Views] No expected MCP server views in scanned workspace batch."
    );
    return {
      scannedWorkspacesCount: workspaceModels.length,
      affectedWorkspaces: [],
      lastScannedWorkspaceModelId,
      hasMore: workspaceModels.length === batchSize,
    };
  }

  const expectedInternalMCPServerIds = Array.from(
    new Set(expectedRows.map((row) => row.internalMCPServerId))
  );
  const defaultSpaceModelIds = Array.from(
    new Set(
      expectedRows.flatMap((row) => [
        row.systemSpaceModelId,
        row.globalSpaceModelId,
      ])
    )
  );

  const existingViews = await MCPServerViewModelWithBypass.findAll({
    attributes: ["workspaceId", "internalMCPServerId", "vaultId"],
    where: {
      workspaceId: {
        [Op.in]: workspaceModelIds,
      },
      serverType: "internal",
      internalMCPServerId: {
        [Op.in]: expectedInternalMCPServerIds,
      },
      vaultId: {
        [Op.in]: defaultSpaceModelIds,
      },
    },
    // WORKSPACE_ISOLATION_BYPASS: Cross-workspace scan for missing default MCP server views.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const existingViewKeys = new Set(
    existingViews
      .map((view) => {
        if (!view.internalMCPServerId) {
          return undefined;
        }
        return getViewKey({
          workspaceModelId: view.workspaceId,
          internalMCPServerId: view.internalMCPServerId,
          spaceModelId: view.vaultId,
        });
      })
      .filter(isDefined)
  );

  const affectedWorkspacesByModelId = new Map<
    ModelId,
    AffectedMCPServerViewsWorkspace
  >();
  for (const expected of expectedRows) {
    const hasSystemView = existingViewKeys.has(
      getViewKey({
        workspaceModelId: expected.workspaceModelId,
        internalMCPServerId: expected.internalMCPServerId,
        spaceModelId: expected.systemSpaceModelId,
      })
    );
    const hasGlobalView = existingViewKeys.has(
      getViewKey({
        workspaceModelId: expected.workspaceModelId,
        internalMCPServerId: expected.internalMCPServerId,
        spaceModelId: expected.globalSpaceModelId,
      })
    );

    if (!hasSystemView || !hasGlobalView) {
      affectedWorkspacesByModelId.set(expected.workspaceModelId, {
        workspaceModelId: expected.workspaceModelId,
        workspaceId: expected.workspaceId,
      });
    }
  }

  const affectedWorkspaces = Array.from(
    affectedWorkspacesByModelId.values()
  ).sort((a, b) => a.workspaceModelId - b.workspaceModelId);

  logger.info(
    {
      lastProcessedWorkspaceModelId,
      lastScannedWorkspaceModelId,
      scannedWorkspacesCount: workspaceModels.length,
      expectedViewsPairsCount: expectedRows.length * 2,
      affectedWorkspacesCount: affectedWorkspaces.length,
      candidates: candidates.map((candidate) => candidate.name),
      triggeringFeature,
    },
    "[Ensure MCP Server Views] Scanned workspace batch."
  );

  return {
    scannedWorkspacesCount: workspaceModels.length,
    affectedWorkspaces,
    lastScannedWorkspaceModelId,
    hasMore: workspaceModels.length === batchSize,
  };
}

export async function ensureMCPServerViewsForWorkspaceBatchActivity({
  workspaces,
  concurrency = DEFAULT_WORKSPACE_CONCURRENCY,
}: EnsureMCPServerViewsForWorkspaceBatchActivityArgs): Promise<EnsureMCPServerViewsForWorkspaceBatchActivityResult> {
  invalidateGlobalFeatureFlagsCache();

  const results = await concurrentExecutor(
    workspaces,
    async (workspace): Promise<WorkspaceProcessingResult> => {
      const activityContext = Context.current();
      const workspaceLogger = logger.child({
        workspaceId: workspace.workspaceId,
        workspaceModelId: workspace.workspaceModelId,
      });

      activityContext.heartbeat();

      try {
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.workspaceId
        );
        invalidateFeatureFlagsCache(auth);
        const { createdViewsCount } =
          await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

        workspaceLogger.info(
          { createdViewsCount },
          "[Ensure MCP Server Views] Ensured auto MCP server views."
        );
        activityContext.heartbeat();

        return {
          status: "success",
          workspaceId: workspace.workspaceId,
          createdViewsCount,
        };
      } catch (error) {
        const errorMessage = errorToString(error);
        workspaceLogger.error(
          { error },
          "[Ensure MCP Server Views] Failed ensuring auto MCP server views."
        );
        activityContext.heartbeat();

        return {
          status: "failure",
          workspaceId: workspace.workspaceId,
          error: errorMessage,
        };
      }
    },
    { concurrency }
  );

  const successes = results.filter(isSuccessResult);
  const failures = results
    .filter(isFailureResult)
    .map(({ workspaceId, error }) => ({ workspaceId, error }));
  const createdViewsCount = successes.reduce(
    (sum, result) => sum + result.createdViewsCount,
    0
  );

  const batchLogPayload = {
    processedWorkspacesCount: workspaces.length,
    createdViewsCount,
    failures,
  };
  if (failures.length > 0) {
    logger.error(
      batchLogPayload,
      "[Ensure MCP Server Views] Processed affected workspace batch with failures."
    );
  } else {
    logger.info(
      batchLogPayload,
      "[Ensure MCP Server Views] Processed affected workspace batch."
    );
  }

  return {
    processedWorkspacesCount: workspaces.length,
    createdViewsCount,
    failures,
  };
}

export async function logEnsureMCPServerViewsWorkflowSummaryActivity(
  summary: EnsureMCPServerViewsWorkflowSummary
): Promise<void> {
  if (summary.failuresCount > 0) {
    logger.error(
      { ...summary },
      "[Ensure MCP Server Views] Workflow completed with failures."
    );
    return;
  }

  logger.info({ ...summary }, "[Ensure MCP Server Views] Workflow completed.");
}
