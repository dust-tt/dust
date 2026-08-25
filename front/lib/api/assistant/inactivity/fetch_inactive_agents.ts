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
  | "archive_raced";

export interface AgentArchivalSkip {
  agentId: string;
  reason: AgentArchivalSkipReason;
}

export interface ArchivableAgentsFetchInput {
  cutoffAt: Date;
  dangerouslySkipPermissionFiltering?: boolean;
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

interface AgentStatusAndTriggers {
  status: AgentConfigurationStatus;
  triggers: AgentTriggerSnapshot[];
}

async function fetchStatusAndTriggers(
  auth: Authenticator,
  agentIds: string[],
  dangerouslySkipPermissionFiltering?: boolean
): Promise<Map<string, AgentStatusAndTriggers>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const configurations = await getAgentConfigurations(auth, {
    agentIds,
    variant: "light",
    dangerouslySkipPermissionFiltering,
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
  { cutoffAt, dangerouslySkipPermissionFiltering }: ArchivableAgentsFetchInput
): Promise<ArchivableAgents> {
  const idleAgents = await MentionResource.listAgentsNotMentionedSince(auth, {
    notMentionedSince: cutoffAt,
  });

  const agentIds = idleAgents.map(({ agentId }) => agentId);
  const createdAtByAgentId = await fetchFirstVersionCreatedAtByAgentId(
    auth,
    agentIds
  );
  const statusAndTriggersByAgentId = await fetchStatusAndTriggers(
    auth,
    agentIds,
    dangerouslySkipPermissionFiltering
  );

  const eligible: ArchivableAgent[] = [];
  const skipped: AgentArchivalSkip[] = [];

  for (const { agentId, lastMentionedAt } of idleAgents) {
    const createdAt = createdAtByAgentId.get(agentId);
    const statusAndTriggers = statusAndTriggersByAgentId.get(agentId);
    // No first version either means the agent is unreadable, or that we could not establish the
    // date the age rule needs. Both are reasons not to archive it.
    if (!createdAt || !statusAndTriggers) {
      skipped.push({ agentId, reason: "agent_not_found" });
      continue;
    }

    const eligibility = evaluateAgentArchivalEligibility({
      agent: { agentId, createdAt, lastMentionedAt, ...statusAndTriggers },
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
