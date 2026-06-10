import { continueAsNew, proxyActivities } from "@temporalio/workflow";

import type * as activities from "./activities";
import {
  DEFAULT_WORKSPACE_BATCH_SIZE,
  DEFAULT_WORKSPACE_CONCURRENCY,
  MAX_FAILURE_SAMPLES,
} from "./activity_config";

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
  processedWorkspacesCount: 0,
  createdViewsCount: 0,
  failuresCount: 0,
  failureSamples: [],
};

export async function ensureMCPServerViewsWorkflow({
  lastProcessedWorkspaceModelId = 0,
  batchSize = DEFAULT_WORKSPACE_BATCH_SIZE,
  concurrency = DEFAULT_WORKSPACE_CONCURRENCY,
  triggeringFeature,
  previousRolloutPercentage,
  rolloutPercentage,
  summary = INITIAL_SUMMARY,
}: EnsureMCPServerViewsWorkflowArgs = {}): Promise<activities.EnsureMCPServerViewsWorkflowSummary> {
  const processBatchResult =
    await ensureMCPServerViewsForWorkspaceBatchActivity({
      lastProcessedWorkspaceModelId,
      batchSize,
      concurrency,
    });

  const nextSummary: activities.EnsureMCPServerViewsWorkflowSummary = {
    scannedWorkspacesCount:
      summary.scannedWorkspacesCount +
      processBatchResult.scannedWorkspacesCount,
    processedWorkspacesCount:
      summary.processedWorkspacesCount +
      processBatchResult.processedWorkspacesCount,
    createdViewsCount:
      summary.createdViewsCount + processBatchResult.createdViewsCount,
    failuresCount: summary.failuresCount + processBatchResult.failuresCount,
    failureSamples: [
      ...summary.failureSamples,
      ...processBatchResult.failureSamples,
    ].slice(0, MAX_FAILURE_SAMPLES),
  };

  if (processBatchResult.hasMore) {
    await continueAsNew<typeof ensureMCPServerViewsWorkflow>({
      lastProcessedWorkspaceModelId:
        processBatchResult.lastScannedWorkspaceModelId,
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
