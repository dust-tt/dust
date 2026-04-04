import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

const PENDING_SUGGESTION_MAX_AGE_DAYS = 30;
const MIN_HOURS_BETWEEN_WORKFLOWS = 23;

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
// has no recent pending suggestions, has not been analyzed recently, and either:
//   (a) has explicit human feedback in the lookback window, or
//   (b) has recent qualifying conversations in the lookback window.
export async function filterEligibleAgents(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  lookbackWindowDays: number
): Promise<LightAgentConfigurationType[]> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  
  // Filter out agents with reinforcement off, non-positive id, or recently analyzed.
  const minTimeSinceLastAnalysis = new Date();
  minTimeSinceLastAnalysis.setHours(
    minTimeSinceLastAnalysis.getHours() - MIN_HOURS_BETWEEN_WORKFLOWS
  );
  
  const candidates = agents.filter((a) => {
    if (a.reinforcement === "off" || a.id <= 0) {
      return false;
    }
    
    // If lastAnalysedAt is set and within the minimum time window, exclude.
    if (a.lastAnalysedAt) {
      const lastAnalysedDate = new Date(a.lastAnalysedAt);
      if (lastAnalysedDate > minTimeSinceLastAnalysis) {
        return false;
      }
    }
    
    return true;
  });
  
  if (candidates.length === 0) {
    recordReinforcedAgentEligibilityMetrics({
      workspaceId,
      candidateCount: 0,
      eligibleCount: 0,
    });
    return [];
  }

  const candidateSIds = candidates.map((a) => a.sId);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackWindowDays);
  const pendingSuggestionCutoff = new Date();
  pendingSuggestionCutoff.setDate(
    pendingSuggestionCutoff.getDate() - PENDING_SUGGESTION_MAX_AGE_DAYS
  );

  const [agentsWithRecentConversations, feedbackCounts, pendingSuggestions] =
    await Promise.all([
      ConversationResource.listIdsOfAgentsWithRecentConversations(auth, {
        agentSIds: candidateSIds,
        cutoffDate,
      }),
      AgentMessageFeedbackResource.getFeedbackCountForAssistants(
        auth,
        candidateSIds,
        lookbackWindowDays
      ),
      AgentSuggestionResource.listByAgentConfigurationIds(auth, candidateSIds, {
        states: ["pending"],
        createdAfter: pendingSuggestionCutoff,
      }),
    ]);

  const agentsWithFeedback = new Set(
    feedbackCounts.map((f) => f.agentConfigurationId)
  );
  const agentsWithRecentConversationsSet = new Set(
    agentsWithRecentConversations
  );
  const agentsWithRecentPendingSuggestions = new Set(
    pendingSuggestions.map((s) => s.agentConfigurationSId)
  );

  const eligible = candidates.filter((a) => {
    if (agentsWithRecentPendingSuggestions.has(a.sId)) {
      return false;
    }
    if (agentsWithFeedback.has(a.sId)) {
      return true;
    }
    return agentsWithRecentConversationsSet.has(a.sId);
  });

  recordReinforcedAgentEligibilityMetrics({
    workspaceId,
    candidateCount: candidates.length,
    eligibleCount: eligible.length,
  });

  return eligible;
}
