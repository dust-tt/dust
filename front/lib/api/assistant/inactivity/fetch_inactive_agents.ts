import type {
  AgentArchivalExclusionReason,
  AgentInactivitySnapshot,
  AgentTriggerSnapshot,
} from "@app/lib/api/assistant/inactivity/policy";
import { evaluateAgentArchivalEligibility } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { MentionResource } from "@app/lib/resources/mention_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";

/**
 * A workspace's agents the rules clear for archival: candidates from the mentions query, rules
 * from `policy.ts`.
 *
 * One activity per workspace, no paging: batching agents would re-run the mentions query per
 * batch for no gain.
 */

/** One logical agent the rules cleared. */
export type ArchivableAgent = Pick<
  AgentInactivitySnapshot,
  "agentId" | "createdAt" | "lastMentionedAt"
>;

/** The rules' exclusions, plus the two outcomes only a caller reading or mutating can produce. */
export type AgentArchivalSkipReason =
  | AgentArchivalExclusionReason
  // Gone, or not visible to this actor, since the mentions read.
  | "agent_not_found"
  // The update matched no row: someone else archived it first. Only the executor emits this.
  | "archive_raced"
  // Archival failed (e.g. a trigger's Temporal schedule could not be removed). Executor-only.
  | "archive_failed";

export interface AgentArchivalSkip {
  agentId: string;
  reason: AgentArchivalSkipReason;
}

export interface ArchivableAgentsFetchInput {
  cutoffAt: Date;
}

export interface ArchivableAgents {
  eligible: ArchivableAgent[];
  skipped: AgentArchivalSkip[];
}

type SkipCountsByReason = Partial<Record<AgentArchivalSkipReason, number>>;

export function countSkipsByReason(
  skipped: AgentArchivalSkip[]
): SkipCountsByReason {
  const counts: SkipCountsByReason = {};
  for (const { reason } of skipped) {
    counts[reason] = (counts[reason] ?? 0) + 1;
  }

  return counts;
}

async function listTriggersByAgentId(
  auth: Authenticator,
  agentIds: string[]
): Promise<Map<string, AgentTriggerSnapshot[]>> {
  if (agentIds.length === 0) {
    return new Map();
  }

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

  return triggersByAgentId;
}

export async function fetchArchivableAgents(
  auth: Authenticator,
  { cutoffAt }: ArchivableAgentsFetchInput
): Promise<ArchivableAgents> {
  const idleAgents = await MentionResource.listAgentsNotMentionedSince(auth, {
    notMentionedSince: cutoffAt,
  });

  const agentIds = idleAgents.map(({ agentId }) => agentId);
  const [agents, triggersByAgentId] = await Promise.all([
    AgentResource.fetchByIds(auth, agentIds),
    listTriggersByAgentId(auth, agentIds),
  ]);
  const agentsById = new Map(agents.map((agent) => [agent.sId, agent]));

  const eligible: ArchivableAgent[] = [];
  const skipped: AgentArchivalSkip[] = [];

  for (const { agentId, lastMentionedAt } of idleAgents) {
    const agent = agentsById.get(agentId);
    // Either gone since the mentions read, or the caller holds no verb on it. Both are reasons not
    // to archive it.
    if (!agent) {
      skipped.push({ agentId, reason: "agent_not_found" });
      continue;
    }

    const eligibility = evaluateAgentArchivalEligibility({
      agent: {
        agentId,
        createdAt: agent.createdAt,
        lastMentionedAt,
        status: agent.status,
        triggers: triggersByAgentId.get(agentId) ?? [],
      },
      cutoffAt,
    });

    if (!eligibility.eligible) {
      skipped.push({ agentId, reason: eligibility.reason });
      continue;
    }

    eligible.push({ agentId, createdAt: agent.createdAt, lastMentionedAt });
  }

  return { eligible, skipped };
}
