import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentArchivalSkip } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import {
  countSkipsByReason,
  fetchArchivableAgents,
} from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import type { AgentInactivityPolicyError } from "@app/lib/api/assistant/inactivity/policy";
import { computeInactivityCutoffAt } from "@app/lib/api/assistant/inactivity/policy";
import { Authenticator } from "@app/lib/auth";
import { heartbeat } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Archives a workspace's inactive agents. Both the manual endpoints and the nightly Temporal
 * activity enter here, on the same rules over the same population.
 */

export interface InactiveAgentsArchivalInput {
  thresholdDays: number;
  evaluatedAt: Date;
}

export interface InactiveAgentsArchival {
  evaluatedAt: Date;
  cutoffAt: Date;
  archivedAgentIds: string[];
  skipped: AgentArchivalSkip[];
}

export type InactiveAgentsArchivalResult = Result<
  InactiveAgentsArchival,
  AgentInactivityPolicyError
>;

/** Safe to call twice: a retry re-runs the fetch, and an archived agent is no longer a candidate. */
export async function archiveInactiveWorkspaceAgents(
  auth: Authenticator,
  { thresholdDays, evaluatedAt }: InactiveAgentsArchivalInput
): Promise<InactiveAgentsArchivalResult> {
  const workspace = auth.getNonNullableWorkspace();

  const cutoffRes = computeInactivityCutoffAt({ thresholdDays, evaluatedAt });
  if (cutoffRes.isErr()) {
    logger.error(
      {
        workspaceId: workspace.sId,
        thresholdDays,
        err: cutoffRes.error,
      },
      "Cannot archive inactive agents: unusable workspace inactivity policy"
    );
    return new Err(cutoffRes.error);
  }
  const cutoffAt = cutoffRes.value;

  if (!auth.isAdmin()) {
    throw new Error("Only a workspace admin can archive inactive agents.");
  }

  const everySpaceAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId,
    { dangerouslyRequestAllGroups: true }
  );

  const { eligible, skipped: refused } = await fetchArchivableAgents(
    everySpaceAuth,
    { cutoffAt }
  );

  const archivedAgentIds: string[] = [];
  const skipped = [...refused];

  for (const { agentId, lastMentionedAt } of eligible) {
    // Temporal heartbeat to avoid activity timeout
    await heartbeat();

    // Not a compare-and-set: an agent restored since the read is archived anyway. Reversible.
    const archived = await archiveAgentConfiguration(everySpaceAuth, agentId);
    if (!archived) {
      skipped.push({ agentId, reason: "archive_raced" });
      continue;
    }

    archivedAgentIds.push(agentId);
    logger.info(
      {
        workspaceId: workspace.sId,
        agentId,
        lastMentionedAt,
        cutoffAt,
        thresholdDays,
      },
      "Archived inactive agent"
    );
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      thresholdDays,
      evaluatedAt,
      cutoffAt,
      archivedCount: archivedAgentIds.length,
      skippedCount: skipped.length,
      skippedCountByReason: countSkipsByReason(skipped),
    },
    "Finished archiving inactive agents"
  );

  return new Ok({
    evaluatedAt,
    cutoffAt,
    archivedAgentIds,
    skipped,
  });
}
