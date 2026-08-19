import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import type {
  AgentArchivalExclusionReason,
  AgentInactivityPolicyError,
  AgentInactivitySnapshot,
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
 * Archives a workspace's inactive agents: resolve the threshold into a cutoff, load the agents,
 * judge each one against the rules in `policy.ts`, and archive those that are eligible.
 *
 * The manual endpoints and the nightly Temporal activity both enter here, so the rules cannot drift
 * between them. The population can: every read is permission-filtered, so a manual run only ever
 * considers the agents its caller can see, where the nightly run sees the whole workspace.
 *
 * The rules are applied against state re-read for the page rather than against what the fetch
 * loaded, because the two do not answer the same question: the fetch finds candidates, the re-read
 * goes through `getAgentConfigurations` and is therefore permission-filtered. That is also what
 * makes a Temporal retry safe — replaying the same input re-reads an agent the first attempt
 * archived, sees `archived`, and skips it instead of emitting a second `agent.archived` audit event.
 *
 * Archiving itself stays the existing `archiveAgentConfiguration` primitive, which owns the side
 * effects (trigger disabling, wake-up cancellation, editor group suspension, audit event).
 */

/**
 * Why an agent this operation looked at was not archived: the rules' own exclusions, plus the two
 * outcomes only the mutation path can produce and that the rules therefore never see.
 */
export type AgentArchivalSkipReason =
  | AgentArchivalExclusionReason
  // The configuration disappeared, or is not visible to this actor, between the fetch and the
  // re-read.
  | "agent_not_found"
  // The archival update matched no row: someone else archived the agent in the meantime.
  | "archive_raced";

export interface AgentArchivalSkip {
  agentId: string;
  reason: AgentArchivalSkipReason;
}

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

/**
 * Re-reads the whole page's facts in two batched queries, before any agent of it is judged. An
 * agent missing from the returned map is one this actor cannot currently read.
 */
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

/**
 * Safe to call twice: an agent archived by a first attempt re-reads as `archived` in a second and is
 * skipped, so a Temporal activity retry cannot double-archive or emit a second `agent.archived`
 * audit event.
 */
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

  // TODO(2026-08-19 INACTIVE_AGENT_ARCHIVAL): load the workspace's candidate agents and, for each,
  // when it was last mentioned. Deferred until the mentions query exists; the page bound (cursor,
  // limit) becomes an input of this use case then, and `nextCursor` part of its result, so the
  // caller keeps owning the loop. Status and triggers do not need to come back with it —
  // `fetchArchivalFacts` is the authority on those, since it is the permission-filtered read.
  //
  // Read from the `mentions` table, not from `agentMentionsCount` in `agent_usage.ts`: its Redis
  // cache only goes back 30 days, which is shorter than the thresholds this feature exists for, and
  // the Elasticsearch index behind it is best-effort. Neither is a basis for a destructive decision.
  // const { agents, nextCursor } = await fetchInactiveAgents(auth, { cutoffAt, cursor, limit });
  const agents: AgentInactivitySnapshot[] = [];

  const factsByAgentId = await fetchArchivalFacts(
    auth,
    agents.map(({ agentId }) => agentId)
  );

  const archivedAgentIds: string[] = [];
  // Skips are not logged per agent: they are the common case, and one line per agent per night
  // would drown the archivals. The run summary below carries the counts by reason.
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

    // The decision comes from the page's re-read, so the window before this mutation is the page's
    // processing time: an agent mentioned or restored during it is archived anyway, and has to be
    // restored by hand. Closing that window properly means a compare-and-set in
    // `archiveAgentConfiguration` — an `expectedStatus` narrowing its `where` clause, which would
    // make the mutation itself refuse an agent that stopped being active. Deliberately not done:
    // it moves a business rule out of `policy.ts` and into a SQL predicate, and the exposure is one
    // reversible archival on a page that takes seconds. Revisit if pages get long.
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
    },
    "Finished archiving inactive agents"
  );

  return new Ok({ evaluatedAt, cutoffAt, archivedAgentIds, skipped });
}
