import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

const PENDING_SUGGESTION_MAX_AGE_DAYS = 30;

function recordReinforcedAgentEligibilityMetrics({
  workspaceId,
  candidateCount,
  eligibleCount,
}: {
  workspaceId: string;
  candidateCount: number;
  eligibleCount: number;
}) {
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
// has signal in the lookback window (human conversation, feedback, or tool usage),
// and has no recent pending suggestions.
export async function filterEligibleAgents(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  lookbackWindowDays: number
): Promise<LightAgentConfigurationType[]> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const candidates = agents.filter(
    (a) => a.reinforcement !== "off" && a.id > 0
  );
  if (candidates.length === 0) {
    logger.info(
      {
        workspaceId,
        candidateCount: 0,
        eligibleCount: 0,
      },
      "ReinforcedAgent: reinforcement eligibility"
    );
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

  const [
    agentSIdsWithConversations,
    feedbackCounts,
    agentsWithFunctionCalls,
    pendingSuggestions,
  ] = await Promise.all([
    ConversationResource.listConversationsForAgents(auth, {
      agentSIds: candidateSIds,
      cutoffDate,
      excludeHumanOutOfTheLoop: true,
    }),
    AgentMessageFeedbackResource.getFeedbackCountForAssistants(
      auth,
      candidateSIds,
      lookbackWindowDays
    ),
    AgentStepContentResource.getAgentsWithFunctionCalls(auth, {
      agentConfigurationIds: candidateSIds,
      createdAfter: cutoffDate,
    }),
    AgentSuggestionResource.listByAgentConfigurationIds(auth, candidateSIds, {
      states: ["pending"],
      createdAfter: pendingSuggestionCutoff,
    }),
  ]);

  const agentsWithSignal = new Set([
    ...agentSIdsWithConversations,
    ...feedbackCounts.map((f) => f.agentConfigurationId),
    ...agentsWithFunctionCalls,
  ]);

  const agentsWithRecentPendingSuggestions = new Set(
    pendingSuggestions.map((s) => s.agentConfigurationSId)
  );

  const eligible = candidates.filter(
    (a) =>
      agentsWithSignal.has(a.sId) &&
      !agentsWithRecentPendingSuggestions.has(a.sId)
  );

  logger.info(
    {
      workspaceId,
      candidateCount: candidates.length,
      eligibleCount: eligible.length,
    },
    "ReinforcedAgent: reinforcement eligibility"
  );

  recordReinforcedAgentEligibilityMetrics({
    workspaceId,
    candidateCount: candidates.length,
    eligibleCount: eligible.length,
  });

  return eligible;
}
