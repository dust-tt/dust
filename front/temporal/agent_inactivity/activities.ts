import { archiveInactiveWorkspaceAgents } from "@app/lib/api/assistant/inactivity/archive_inactive_agents";
import { countSkipsByReason } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { getInactiveAgentArchivalThresholdDays } from "@app/types/user";
import { ApplicationFailure } from "@temporalio/common";

export async function getWorkspacesWithInactiveAgentArchivalActivity(): Promise<
  string[]
> {
  const flaggedWorkspaces = await WorkspaceResource.listWithFeatureFlag(
    "archive_inactive_agents"
  );

  // Sorted so one tick's fan-out reads the same way as the next in the Temporal history.
  const workspaceIds = flaggedWorkspaces
    .filter(
      (workspace) =>
        getInactiveAgentArchivalThresholdDays(
          renderLightWorkspaceType({ workspace })
        ) !== null
    )
    .map((workspace) => workspace.sId)
    .sort();

  logger.info(
    {
      flaggedWorkspaceCount: flaggedWorkspaces.length,
      configuredWorkspaceCount: workspaceIds.length,
    },
    "[AgentInactivity] Enumerated workspaces with automatic agent archival"
  );

  return workspaceIds;
}

export interface ArchiveWorkspaceInactiveAgentsActivityInput {
  workspaceId: string;
  // Fixed by the parent workflow, so every workspace of one sweep is judged against one instant and
  // a retry re-derives the same cutoff instead of sliding it forward.
  evaluatedAtMs: number;
}

export interface ArchiveWorkspaceInactiveAgentsActivityResult {
  workspaceId: string;
  // Null when the workspace stopped asking for archival between the enumeration and here.
  thresholdDays: number | null;
  archivedCount: number;
  skippedCount: number;
}

/**
 * Archives one workspace's inactive agents. The whole workspace in one activity: the agents are not
 * batched, see the note in `fetch_inactive_agents.ts`.
 *
 * Safe to retry: `archiveInactiveWorkspaceAgents` re-runs the fetch, and an agent it already
 * archived is no longer a candidate.
 */
export async function archiveWorkspaceInactiveAgentsActivity({
  workspaceId,
  evaluatedAtMs,
}: ArchiveWorkspaceInactiveAgentsActivityInput): Promise<ArchiveWorkspaceInactiveAgentsActivityResult> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  // Read here rather than carry the threshold through the workflow arguments, so an admin who turns
  // archival off while the sweep is running is obeyed.
  const thresholdDays = getInactiveAgentArchivalThresholdDays(workspace);
  if (thresholdDays === null) {
    logger.info(
      { workspaceId },
      "[AgentInactivity] Automatic archival no longer configured, skipping workspace"
    );

    return {
      workspaceId,
      thresholdDays: null,
      archivedCount: 0,
      skippedCount: 0,
    };
  }

  // The same gate as the endpoints: a feature pulled mid-sweep stops the archival too.
  if (!(await hasFeatureFlag(auth, "archive_inactive_agents"))) {
    logger.info(
      { workspaceId },
      "[AgentInactivity] Feature no longer enabled, skipping workspace"
    );

    return {
      workspaceId,
      thresholdDays: null,
      archivedCount: 0,
      skippedCount: 0,
    };
  }

  const archivalRes = await archiveInactiveWorkspaceAgents(auth, {
    thresholdDays,
    evaluatedAt: new Date(evaluatedAtMs),
  });
  if (archivalRes.isErr()) {
    // The only error is a threshold the rules refuse, which is stored configuration rather than a
    // transient fault: a retry would compute the same refusal.
    throw ApplicationFailure.nonRetryable(
      archivalRes.error.message,
      archivalRes.error.type
    );
  }

  const { archivedAgentIds, skipped, cutoffAt } = archivalRes.value;

  if (archivedAgentIds.length > 0) {
    void emitAuditLogEventDirect({
      workspace,
      action: "workspace.inactive_agents_archived",
      actor: {
        type: "system",
        id: "agent_inactivity",
        name: "Inactive agent archival",
      },
      targets: [buildAuditLogTarget("workspace", workspace)],
      context: { location: "internal" },
      metadata: {
        threshold_days: String(thresholdDays),
        archived_count: String(archivedAgentIds.length),
        skipped_count: String(skipped.length),
      },
    });
  }

  logger.info(
    {
      workspaceId,
      thresholdDays,
      cutoffAt,
      archivedCount: archivedAgentIds.length,
      skippedCount: skipped.length,
      skippedCountByReason: countSkipsByReason(skipped),
    },
    "[AgentInactivity] Finished nightly archival for workspace"
  );

  return {
    workspaceId,
    thresholdDays,
    archivedCount: archivedAgentIds.length,
    skippedCount: skipped.length,
  };
}
