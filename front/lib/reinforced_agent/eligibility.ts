import type { Authenticator } from "@app/lib/auth";
import type { ReinforcementAutoTrackSignals } from "@app/lib/reinforced_agent/signals";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

function recordReinforcedAgentEligibilityMetrics({
  workspaceId,
  candidateCount,
  eligibleCount,
}: {
  workspaceId: string;
  candidateCount: number;
  eligibleCount: number;
}) {
  logger.info(
    { workspaceId, candidateCount, eligibleCount },
    "ReinforcedAgent: reinforcement eligibility"
  );

  const tags = [`workspace_id:${workspaceId}`];
  const statsd = getStatsDClient();

  statsd.increment("reinforced_agent.eligibility.runs.count", 1, tags);

  statsd.distribution(
    "reinforced_agent.eligibility.candidates.distribution",
    candidateCount,
    tags
  );
  statsd.distribution(
    "reinforced_agent.eligibility.eligible_agents.distribution",
    eligibleCount,
    tags
  );

  if (candidateCount > 0) {
    statsd.distribution(
      "reinforced_agent.eligibility.eligible_fraction.distribution",
      eligibleCount / candidateCount,
      tags
    );
  }
}

// An agent is eligible if: reinforcement is not "off", it is workspace-owned (id > 0),
// has no recent pending suggestions, and either:
//   (a) has explicit human feedback in the lookback window, or
//   (b) has recent qualifying conversations in the lookback window.
export function filterEligibleAgents(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  signals: ReinforcementAutoTrackSignals
): LightAgentConfigurationType[] {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const candidates = agents.filter(
    (a) => a.reinforcement !== "off" && a.id > 0
  );
  if (candidates.length === 0) {
    recordReinforcedAgentEligibilityMetrics({
      workspaceId,
      candidateCount: 0,
      eligibleCount: 0,
    });
    return [];
  }

  const eligible = candidates.filter((agent) => {
    if (signals.agentIdsWithRecentPendingSuggestions.has(agent.sId)) {
      return false;
    }
    const feedback = signals.feedbackCountByAgentId.get(agent.sId) ?? 0;
    const humanConvCount =
      signals.humanConversationSIdsByAgent.get(agent.sId)?.length ?? 0;
    return feedback > 0 || humanConvCount > 0;
  });

  recordReinforcedAgentEligibilityMetrics({
    workspaceId,
    candidateCount: candidates.length,
    eligibleCount: eligible.length,
  });

  return eligible;
}
