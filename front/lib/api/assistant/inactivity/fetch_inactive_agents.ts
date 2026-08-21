import {
  fetchFirstVersionCreatedAtByAgentId,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import type {
  AgentArchivalExclusionReason,
  AgentInactivitySnapshot,
  AgentTriggerSnapshot,
} from "@app/lib/api/assistant/inactivity/policy";
import { evaluateAgentArchivalEligibility } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import { MentionResource } from "@app/lib/resources/mention_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { AgentConfigurationStatus } from "@app/types/assistant/agent";

/**
 * Loads one page of a workspace's agents that the rules clear for archival.
 *
 * The candidates come from the mentions query, the rules from `policy.ts`; this is where the two
 * meet. Every read is permission-filtered, so two actors can legitimately get different answers for
 * the same workspace.
 *
 * A workspace is the unit of work: the nightly run starts one activity per workspace, so there is
 * nothing to page through here. Splitting the agents into batches would re-run the mentions query
 * once per batch, and the cursor would have to survive between them, for no gain.
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
  | "archive_raced";

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

/** The facts the rules read about an agent, as they stand when the page is evaluated. */
interface AgentArchivalFacts {
  status: AgentConfigurationStatus;
  triggers: AgentTriggerSnapshot[];
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

export async function fetchArchivableAgents(
  auth: Authenticator,
  { cutoffAt }: ArchivableAgentsFetchInput
): Promise<ArchivableAgents> {
  const idleAgents = await MentionResource.listAgentsNotMentionedSince(auth, {
    notMentionedSince: cutoffAt,
  });

  const agentIds = idleAgents.map(({ agentId }) => agentId);
  const createdAtByAgentId = await fetchFirstVersionCreatedAtByAgentId(
    auth,
    agentIds
  );
  const factsByAgentId = await fetchArchivalFacts(auth, agentIds);

  const eligible: ArchivableAgent[] = [];
  // Skips are the common case, so callers count them in the run summary rather than log each one.
  const skipped: AgentArchivalSkip[] = [];

  for (const { agentId, lastMentionedAt } of idleAgents) {
    const createdAt = createdAtByAgentId.get(agentId);
    const facts = factsByAgentId.get(agentId);
    // No first version either means the agent is unreadable, or that we could not establish the
    // date the age rule needs. Both are reasons not to archive it.
    if (!createdAt || !facts) {
      skipped.push({ agentId, reason: "agent_not_found" });
      continue;
    }

    const eligibility = evaluateAgentArchivalEligibility({
      agent: { agentId, createdAt, lastMentionedAt, ...facts },
      cutoffAt,
    });

    if (!eligibility.eligible) {
      skipped.push({ agentId, reason: eligibility.reason });
      continue;
    }

    eligible.push({ agentId, createdAt, lastMentionedAt });
  }

  return { eligible, skipped };
}
