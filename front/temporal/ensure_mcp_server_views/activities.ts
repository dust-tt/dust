import {
  Authenticator,
  invalidateFeatureFlagsCache,
  invalidateGlobalFeatureFlagsCache,
} from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import {
  errorToString,
  normalizeError,
} from "@app/types/shared/utils/error_utils";
import { Context } from "@temporalio/activity";

import {
  DEFAULT_WORKSPACE_CONCURRENCY,
  MAX_FAILURE_SAMPLES,
} from "./activity_config";

export type EnsureMCPServerViewsWorkflowTrigger = {
  triggeringFeature?: WhitelistableFeature;
  previousRolloutPercentage?: number;
  rolloutPercentage?: number;
};

export type EnsureMCPServerViewsForWorkspaceBatchActivityArgs = {
  lastProcessedWorkspaceModelId?: ModelId;
  batchSize: number;
  concurrency?: number;
};

export type EnsureMCPServerViewsWorkspaceFailure = {
  workspaceId: string;
  error: string;
};

export type EnsureMCPServerViewsForWorkspaceBatchActivityResult = {
  scannedWorkspacesCount: number;
  processedWorkspacesCount: number;
  createdViewsCount: number;
  failuresCount: number;
  failureSamples: EnsureMCPServerViewsWorkspaceFailure[];
  lastScannedWorkspaceModelId: ModelId;
  hasMore: boolean;
};

export type EnsureMCPServerViewsWorkflowSummary = {
  scannedWorkspacesCount: number;
  processedWorkspacesCount: number;
  createdViewsCount: number;
  failuresCount: number;
  failureSamples: EnsureMCPServerViewsWorkspaceFailure[];
};

export type WorkspaceProcessingResult =
  | { status: "success"; workspaceId: string; createdViewsCount: number }
  | {
      status: "failure";
      workspaceId: string;
      error: string;
      normalizedError: ReturnType<typeof normalizeError>;
    };

export function isSuccessResult(
  result: WorkspaceProcessingResult
): result is Extract<WorkspaceProcessingResult, { status: "success" }> {
  return result.status === "success";
}

export function isFailureResult(
  result: WorkspaceProcessingResult
): result is Extract<WorkspaceProcessingResult, { status: "failure" }> {
  return result.status === "failure";
}

async function ensureAutoMCPServerViewsForWorkspace(
  workspaceId: string
): Promise<number> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  invalidateFeatureFlagsCache(auth);
  const { createdViewsCount } =
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  return createdViewsCount;
}

async function processWorkspace(
  workspaceId: string
): Promise<WorkspaceProcessingResult> {
  try {
    const createdViewsCount =
      await ensureAutoMCPServerViewsForWorkspace(workspaceId);

    return {
      status: "success",
      workspaceId,
      createdViewsCount,
    };
  } catch (error) {
    return {
      status: "failure",
      workspaceId,
      error: errorToString(error),
      normalizedError: normalizeError(error),
    };
  }
}

export async function ensureMCPServerViewsForWorkspaceBatchActivity({
  lastProcessedWorkspaceModelId = 0,
  batchSize,
  concurrency = DEFAULT_WORKSPACE_CONCURRENCY,
}: EnsureMCPServerViewsForWorkspaceBatchActivityArgs): Promise<EnsureMCPServerViewsForWorkspaceBatchActivityResult> {
  const workspaces =
    await WorkspaceResource.unsafeListWorkspaceIdBatchAfterModelId({
      lastWorkspaceModelId: lastProcessedWorkspaceModelId,
      limit: batchSize,
    });
  const lastScannedWorkspaceModelId =
    workspaces.at(-1)?.workspaceModelId ?? lastProcessedWorkspaceModelId;

  logger.info(
    {
      lastProcessedWorkspaceModelId,
      lastScannedWorkspaceModelId,
      scannedWorkspacesCount: workspaces.length,
    },
    "[Ensure MCP Server Views] Listed workspace batch."
  );

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

      const result = await processWorkspace(workspace.workspaceId);
      if (isSuccessResult(result)) {
        workspaceLogger.info(
          { createdViewsCount: result.createdViewsCount },
          "[Ensure MCP Server Views] Ensured auto MCP server views."
        );
      } else {
        workspaceLogger.error(
          { err: result.normalizedError },
          "[Ensure MCP Server Views] Failed ensuring auto MCP server views."
        );
      }

      activityContext.heartbeat();
      return result;
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
      "[Ensure MCP Server Views] Processed workspace batch with failures."
    );
  } else {
    logger.info(
      batchLogPayload,
      "[Ensure MCP Server Views] Processed workspace batch."
    );
  }

  return {
    scannedWorkspacesCount: workspaces.length,
    processedWorkspacesCount: workspaces.length,
    createdViewsCount,
    failuresCount: failures.length,
    failureSamples: failures.slice(0, MAX_FAILURE_SAMPLES),
    lastScannedWorkspaceModelId,
    hasMore: workspaces.length === batchSize,
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
