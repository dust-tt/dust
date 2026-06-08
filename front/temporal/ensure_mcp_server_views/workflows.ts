import { continueAsNew, proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";
import {
  DEFAULT_SCAN_BATCH_SIZE,
  DEFAULT_WORKSPACE_CONCURRENCY,
  MAX_FAILURE_SAMPLES,
} from "./config";

const { getAffectedMCPServerViewsWorkspaceBatchActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "1 minute",
});

const {
  ensureMCPServerViewsForWorkspaceBatchActivity,
  logEnsureMCPServerViewsWorkflowSummaryActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
  heartbeatTimeout: "5 minutes",
});

export type EnsureMCPServerViewsWorkflowArgs =
  activities.EnsureMCPServerViewsWorkflowTrigger & {
    lastProcessedWorkspaceModelId?: number;
    batchSize?: number;
    concurrency?: number;
    summary?: activities.EnsureMCPServerViewsWorkflowSummary;
  };

const INITIAL_SUMMARY: activities.EnsureMCPServerViewsWorkflowSummary = {
  scannedWorkspacesCount: 0,
  affectedWorkspacesCount: 0,
  processedWorkspacesCount: 0,
  createdViewsCount: 0,
  failuresCount: 0,
  failureSamples: [],
};

function mergeSummary({
  summary,
  scannedWorkspacesCount,
  affectedWorkspacesCount,
  processedWorkspacesCount,
  createdViewsCount,
  failures,
}: {
  summary: activities.EnsureMCPServerViewsWorkflowSummary;
  scannedWorkspacesCount: number;
  affectedWorkspacesCount: number;
  processedWorkspacesCount: number;
  createdViewsCount: number;
  failures: activities.EnsureMCPServerViewsWorkspaceFailure[];
}): activities.EnsureMCPServerViewsWorkflowSummary {
  return {
    scannedWorkspacesCount:
      summary.scannedWorkspacesCount + scannedWorkspacesCount,
    affectedWorkspacesCount:
      summary.affectedWorkspacesCount + affectedWorkspacesCount,
    processedWorkspacesCount:
      summary.processedWorkspacesCount + processedWorkspacesCount,
    createdViewsCount: summary.createdViewsCount + createdViewsCount,
    failuresCount: summary.failuresCount + failures.length,
    failureSamples: [...summary.failureSamples, ...failures].slice(
      0,
      MAX_FAILURE_SAMPLES
    ),
  };
}

export async function ensureMCPServerViewsWorkflow({
  lastProcessedWorkspaceModelId = 0,
  batchSize = DEFAULT_SCAN_BATCH_SIZE,
  concurrency = DEFAULT_WORKSPACE_CONCURRENCY,
  triggeringFeature,
  previousRolloutPercentage,
  rolloutPercentage,
  summary = INITIAL_SUMMARY,
}: EnsureMCPServerViewsWorkflowArgs = {}): Promise<activities.EnsureMCPServerViewsWorkflowSummary> {
  const affectedBatch = await getAffectedMCPServerViewsWorkspaceBatchActivity({
    lastProcessedWorkspaceModelId,
    batchSize,
    triggeringFeature,
    previousRolloutPercentage,
    rolloutPercentage,
  });

  const processBatchResult =
    affectedBatch.affectedWorkspaces.length > 0
      ? await ensureMCPServerViewsForWorkspaceBatchActivity({
          workspaces: affectedBatch.affectedWorkspaces,
          concurrency,
        })
      : {
          processedWorkspacesCount: 0,
          createdViewsCount: 0,
          failures: [],
        };

  const nextSummary = mergeSummary({
    summary,
    scannedWorkspacesCount: affectedBatch.scannedWorkspacesCount,
    affectedWorkspacesCount: affectedBatch.affectedWorkspaces.length,
    processedWorkspacesCount: processBatchResult.processedWorkspacesCount,
    createdViewsCount: processBatchResult.createdViewsCount,
    failures: processBatchResult.failures,
  });

  if (affectedBatch.hasMore) {
    await continueAsNew<typeof ensureMCPServerViewsWorkflow>({
      lastProcessedWorkspaceModelId:
        affectedBatch.lastScannedWorkspaceModelId ??
        lastProcessedWorkspaceModelId,
      batchSize,
      concurrency,
      triggeringFeature,
      previousRolloutPercentage,
      rolloutPercentage,
      summary: nextSummary,
    });
  }

  await logEnsureMCPServerViewsWorkflowSummaryActivity(nextSummary);
  return nextSummary;
}
