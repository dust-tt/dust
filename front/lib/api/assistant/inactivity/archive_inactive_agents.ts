import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import type { AgentPageBound } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import { fetchInactiveAgents } from "@app/lib/api/assistant/inactivity/fetch_inactive_agents";
import type {
  AgentArchivalExclusionReason,
  AgentInactivityPolicyError,
  AgentTriggerSnapshot,
} from "@app/lib/api/assistant/inactivity/policy";
import {
  computeInactivityCutoffAt,
  evaluateAgentArchivalEligibility,
} from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationStatus } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Archives a workspace's inactive agents. Both the manual endpoints and the nightly Temporal
 * activity enter here, so the rules cannot drift between them; the population still differs, since
 * every read is permission-filtered.
 */

/** The rules' exclusions, plus the two outcomes only the mutation path can produce. */
export type AgentArchivalSkipReason =
  | AgentArchivalExclusionReason
  // Gone, or not visible to this actor, since the fetch.
  | "agent_not_found"
  // The update matched no row: someone else archived it first.
  | "archive_raced";

export interface AgentArchivalSkip {
  agentId: string;
  reason: AgentArchivalSkipReason;
}

export interface InactiveAgentsArchivalInput {
  thresholdDays: number;
  evaluatedAt: Date;
  // Which slice to walk, not what to decide: the caller owns the loop.
  page: AgentPageBound;
}

export interface InactiveAgentsArchival {
  evaluatedAt: Date;
  cutoffAt: Date;
  archivedAgentIds: string[];
  skipped: AgentArchivalSkip[];
  // Paging, not outcome: null once the workspace is exhausted.
  nextCursor: string | null;
}

export type InactiveAgentsArchivalResult = Result<
  InactiveAgentsArchival,
  AgentInactivityPolicyError
>;

/** The facts the rules read about an agent, as they stand at the moment the page is judged. */
interface AgentArchivalFacts {
  status: AgentConfigurationStatus;
  triggers: AgentTriggerSnapshot[];
}

type SkipCountsByReason = Partial<Record<AgentArchivalSkipReason, number>>;

function countSkipsByReason(skipped: AgentArchivalSkip[]): SkipCountsByReason {
  const counts: SkipCountsByReason = {};
  for (const { reason } of skipped) {
    counts[reason] = (counts[reason] ?? 0) + 1;
  }

  return counts;
}

/** A missing agent is one this actor cannot read. */
async function fetchArchivalFacts(
  auth: Authenticator,
  agentIds: string[]
): Promise<Map<string, AgentArchivalFacts>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const configurations = await getAgentConfigurations(auth, {
    agentIds,
    variant: "light",
  });

  const triggers = await TriggerResource.listByAgentConfigurationIds(
    auth,
    agentIds
  );

  const triggersByAgentId = new Map<string, AgentTriggerSnapshot[]>();
  for (const { agentConfigurationId, kind, status } of triggers) {
    const agentTriggers = triggersByAgentId.get(agentConfigurationId) ?? [];
    agentTriggers.push({ kind, status });
    triggersByAgentId.set(agentConfigurationId, agentTriggers);
  }

  return new Map(
    configurations.map(({ sId, status }) => [
      sId,
      { status, triggers: triggersByAgentId.get(sId) ?? [] },
    ])
  );
}

/** Safe to call twice: a retry re-runs the fetch, and an archived agent is no longer a candidate. */
export async function archiveInactiveWorkspaceAgents(
  auth: Authenticator,
  { thresholdDays, evaluatedAt, page }: InactiveAgentsArchivalInput
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

  const { agents, nextCursor } = await fetchInactiveAgents(auth, {
    cutoffAt,
    page,
  });

  const factsByAgentId = await fetchArchivalFacts(
    auth,
    agents.map(({ agentId }) => agentId)
  );

  const archivedAgentIds: string[] = [];
  // Counted in the run summary, not logged per agent: skips are the common case.
  const skipped: AgentArchivalSkip[] = [];

  for (const agent of agents) {
    const { agentId } = agent;

    const facts = factsByAgentId.get(agentId);
    if (!facts) {
      skipped.push({ agentId, reason: "agent_not_found" });
      continue;
    }

    const eligibility = evaluateAgentArchivalEligibility({
      agent: { ...agent, ...facts },
      cutoffAt,
    });

    if (!eligibility.eligible) {
      skipped.push({ agentId, reason: eligibility.reason });
      continue;
    }

    // Not a compare-and-set: an agent restored since the re-read is archived anyway. Reversible.
    const archived = await archiveAgentConfiguration(auth, agentId);
    if (!archived) {
      skipped.push({ agentId, reason: "archive_raced" });
      continue;
    }

    archivedAgentIds.push(agentId);
    logger.info(
      {
        workspaceId: workspace.sId,
        agentId,
        lastMentionedAt: agent.lastMentionedAt,
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
      hasMore: nextCursor !== null,
    },
    "Finished archiving inactive agents"
  );

  return new Ok({
    evaluatedAt,
    cutoffAt,
    archivedAgentIds,
    skipped,
    nextCursor,
  });
}
