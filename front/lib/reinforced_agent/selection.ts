import type { Authenticator } from "@app/lib/auth";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import {
  DEFAULT_MAX_AUTO_AGENTS_PER_RUN,
  DEFAULT_MAX_CONVERSATIONS_PER_AGENT,
  DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE,
  DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
  DEFAULT_TOTAL_CONVERSATIONS_TO_ANALYZE,
} from "./constants";
import {
  fetchDistinctUsersAndToolErrorCounts,
  type ReinforcementAutoTrackSignals,
} from "./signals";

// Maximum days since agent configuration update to consider it "stale".
const AGENT_UPDATE_STALENESS_WINDOW_CLAMP = 90;

// Weighted sum of normalized signals for auto-track ranking (each factor is 0–1 within the cohort; sum = 1).
const REINFORCEMENT_RANK_WEIGHT_FEEDBACK = 0.3;
const REINFORCEMENT_RANK_WEIGHT_REINFORCEMENT_STALENESS = 0.2; // Favors agents that have not been reinforced recently
const REINFORCEMENT_RANK_WEIGHT_HUMAN_CONVERSATIONS = 0.2;
const REINFORCEMENT_RANK_WEIGHT_TOOL_ERROR = 0.1;
const REINFORCEMENT_RANK_WEIGHT_MULTI_USER = 0.1;
const REINFORCEMENT_RANK_WEIGHT_AGENT_VERSION_FRESHNESS = 0.1; // Favors agents with recently updated configs

export interface AgentSelectionResult {
  agentConfigurationId: string;
  conversationsToSample: number;
}

export interface SelectionOptions {
  maxConversationsPerAgent?: number;
  maxAutoAgentsPerRun?: number;
  totalAutoConversationPool?: number;
  minConversationsToInclude?: number;
}

export interface ReinforcementSelectionInput {
  explicitOnAgents: LightAgentConfigurationType[];
  eligibleAutoAgents: LightAgentConfigurationType[];
  signals: ReinforcementAutoTrackSignals;
  options: SelectionOptions;
}

interface ScoredAgent {
  agent: LightAgentConfigurationType;
  score: number;
  normalized: {
    feedback: number;
    reinforcementStaleness: number;
    humanConversations: number;
    toolError: number;
    multiUser: number;
    staleness: number;
  };
}

/**
 * Determines which agents will be run and how many conversations to sample for each.
 *
 * - Agents in `on` mode — Each gets `maxConversationsPerAgent`. Does not consume `maxAutoAgentsPerRun`.
 * - Agents in `auto` mode — Prioritized based on a scoring system up to `maxAutoAgentsPerRun`.
 *
 * Each agent is assigned a score, then conversation counts are split in proportion to those scores among the agents that are selected.
 */
export async function selectAgentsForReinforcement(
  auth: Authenticator,
  {
    explicitOnAgents,
    eligibleAutoAgents,
    signals,
    options,
  }: ReinforcementSelectionInput
): Promise<AgentSelectionResult[]> {
  const maxConversationsPerAgent =
    options.maxConversationsPerAgent ?? DEFAULT_MAX_CONVERSATIONS_PER_AGENT;
  const maxAutoAgentsPerRun =
    options.maxAutoAgentsPerRun ?? DEFAULT_MAX_AUTO_AGENTS_PER_RUN;
  const totalAutoConversationPool =
    options.totalAutoConversationPool ?? DEFAULT_TOTAL_CONVERSATIONS_TO_ANALYZE;
  const minConversationsToInclude =
    options.minConversationsToInclude ?? DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE;

  const workspaceId = auth.getNonNullableWorkspace().sId;

  const explicitOnResults: AgentSelectionResult[] = explicitOnAgents.map(
    (a) => ({
      agentConfigurationId: a.sId,
      conversationsToSample: maxConversationsPerAgent,
    })
  );

  recordSelectionMetrics({
    workspaceId,
    explicitOnAgentsCount: explicitOnResults.length,
    autoEligibleCount: eligibleAutoAgents.length,
    autoSelectedCount: Math.min(eligibleAutoAgents.length, maxAutoAgentsPerRun),
  });

  if (eligibleAutoAgents.length === 0) {
    return explicitOnResults;
  }

  const { distinctUserCountByAgentSId, toolErrorCountByAgentSId } =
    await fetchDistinctUsersAndToolErrorCounts(
      workspaceId,
      eligibleAutoAgents.map((a) => a.sId),
      DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS
    );

  const feedbackCountMap = signals.feedbackCountByAgentSId;
  const humanConvsByAgent = signals.humanConversationSIdsByAgent;

  // Collect raw metric values across all eligible agents for cross-agent normalization.
  const agentFeedbackCounts: number[] = [];
  const agentHumanConversationsCount: number[] = [];
  const agentToolErrorCount: number[] = [];
  const agentUserCount: number[] = [];

  for (const agent of eligibleAutoAgents) {
    agentFeedbackCounts.push(feedbackCountMap.get(agent.sId) ?? 0);
    agentHumanConversationsCount.push(
      humanConvsByAgent.get(agent.sId)?.length ?? 0
    );
    agentToolErrorCount.push(toolErrorCountByAgentSId.get(agent.sId) ?? 0);
    agentUserCount.push(distinctUserCountByAgentSId.get(agent.sId) ?? 0);
  }

  const maxFeedback = Math.max(...agentFeedbackCounts, 0);
  const maxHumanConversations = Math.max(...agentHumanConversationsCount, 0);
  const maxToolError = Math.max(...agentToolErrorCount, 0);
  const maxMultiUser = Math.max(...agentUserCount, 0);

  const normalize = (value: number, max: number): number =>
    max === 0 ? 0 : value / max;

  const scored: ScoredAgent[] = eligibleAutoAgents.map((agent) => {
    const feedback = normalize(
      feedbackCountMap.get(agent.sId) ?? 0,
      maxFeedback
    );
    // TODO(dust-tt/tasks#7313): We do not yet persist last reinforcement analysis time per agent.
    // Once we do, we can use that time to calculate the staleness of the agent.
    // For now, we use a static factor of 1.
    const reinforcementStaleness = 1;
    const humanConversations = normalize(
      humanConvsByAgent.get(agent.sId)?.length ?? 0,
      maxHumanConversations
    );
    const toolError = normalize(
      toolErrorCountByAgentSId.get(agent.sId) ?? 0,
      maxToolError
    );
    const multiUser = normalize(
      distinctUserCountByAgentSId.get(agent.sId) ?? 0,
      maxMultiUser
    );

    const now = Date.now();
    const versionCreatedAt = agent.versionCreatedAt
      ? new Date(agent.versionCreatedAt).getTime()
      : null;
    const daysSinceConfigUpdate = versionCreatedAt
      ? (now - versionCreatedAt) / (1000 * 60 * 60 * 24)
      : AGENT_UPDATE_STALENESS_WINDOW_CLAMP;
    // Despite the name `staleness`, this is a recency score: 1 right after a version bump, decays to 0 over the clamp window.
    const staleness = Math.max(
      0,
      Math.min(
        1,
        1 - daysSinceConfigUpdate / AGENT_UPDATE_STALENESS_WINDOW_CLAMP
      )
    );

    const score =
      REINFORCEMENT_RANK_WEIGHT_FEEDBACK * feedback +
      REINFORCEMENT_RANK_WEIGHT_REINFORCEMENT_STALENESS *
        reinforcementStaleness +
      REINFORCEMENT_RANK_WEIGHT_HUMAN_CONVERSATIONS * humanConversations +
      REINFORCEMENT_RANK_WEIGHT_TOOL_ERROR * toolError +
      REINFORCEMENT_RANK_WEIGHT_MULTI_USER * multiUser +
      REINFORCEMENT_RANK_WEIGHT_AGENT_VERSION_FRESHNESS * staleness;

    return {
      agent,
      score,
      normalized: {
        feedback,
        reinforcementStaleness,
        humanConversations,
        toolError,
        multiUser,
        staleness,
      },
    };
  });

  // Sort agents by score descending
  scored.sort((a, b) => b.score - a.score);

  const topK = Math.min(maxAutoAgentsPerRun, scored.length);
  const totalScore = scored.slice(0, topK).reduce((sum, s) => sum + s.score, 0);

  // Determining how many conversations to sample for each agent
  const autoResults: AgentSelectionResult[] = [];
  const selectedAllocations = new Map<string, number>();

  for (let i = 0; i < scored.length; i++) {
    const { agent, score } = scored[i]!;
    if (autoResults.length >= maxAutoAgentsPerRun) {
      break;
    }
    const raw = (score / totalScore) * totalAutoConversationPool;
    if (raw < minConversationsToInclude) {
      // Drop agents whose unclamped allocation is below the minimum — insufficient signal.
      continue;
    }

    let conversationsToSample = Math.min(
      maxConversationsPerAgent,
      Math.max(minConversationsToInclude, Math.round(raw))
    );

    // Drop agents who do not have enough human-in-the-loop conversations to sample
    const availableHumanConvs = humanConvsByAgent.get(agent.sId)?.length ?? 0;
    conversationsToSample = Math.min(
      conversationsToSample,
      availableHumanConvs
    );
    if (conversationsToSample < minConversationsToInclude) {
      continue;
    }

    autoResults.push({
      agentConfigurationId: agent.sId,
      conversationsToSample,
    });
    selectedAllocations.set(agent.sId, conversationsToSample);
  }

  recordAgentScoringMetrics(workspaceId, scored, selectedAllocations);

  return [...explicitOnResults, ...autoResults];
}

function recordAgentScoringMetrics(
  workspaceId: string,
  scored: ScoredAgent[],
  selectedAllocations: Map<string, number>
) {
  const tags = [`workspace_id:${workspaceId}`];
  const statsd = getStatsDClient();

  for (const { agent, score, normalized } of scored) {
    const {
      feedback,
      reinforcementStaleness: recency,
      humanConversations,
      toolError,
      multiUser,
      staleness,
    } = normalized;
    const conversationsToSample = selectedAllocations.get(agent.sId) ?? null;
    const wasSelected = conversationsToSample !== null;

    statsd.distribution(
      "reinforced_agent.scoring.feedback_normalized",
      feedback,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.recency_normalized",
      recency,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.human_conversations_normalized",
      humanConversations,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.tool_error_normalized",
      toolError,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.multi_user_normalized",
      multiUser,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.staleness_score",
      staleness,
      tags
    );

    // Weighted contributions (component × weight).
    statsd.distribution(
      "reinforced_agent.scoring.feedback_contribution",
      REINFORCEMENT_RANK_WEIGHT_FEEDBACK * feedback,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.recency_contribution",
      REINFORCEMENT_RANK_WEIGHT_REINFORCEMENT_STALENESS * recency,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.human_conversations_contribution",
      REINFORCEMENT_RANK_WEIGHT_HUMAN_CONVERSATIONS * humanConversations,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.tool_error_contribution",
      REINFORCEMENT_RANK_WEIGHT_TOOL_ERROR * toolError,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.multi_user_contribution",
      REINFORCEMENT_RANK_WEIGHT_MULTI_USER * multiUser,
      tags
    );
    statsd.distribution(
      "reinforced_agent.scoring.staleness_contribution",
      REINFORCEMENT_RANK_WEIGHT_AGENT_VERSION_FRESHNESS * staleness,
      tags
    );

    statsd.distribution("reinforced_agent.scoring.total_score", score, tags);

    if (wasSelected && conversationsToSample !== null) {
      statsd.distribution(
        "reinforced_agent.scoring.conversations_to_sample",
        conversationsToSample,
        tags
      );
    }

    logger.info(
      {
        workspaceId,
        agentConfigurationId: agent.sId,
        score,
        wasSelected,
        conversationsToSample,
        normalized: {
          feedback,
          recency,
          humanConversations,
          toolError,
          multiUser,
          staleness,
        },
        contributions: {
          feedback: REINFORCEMENT_RANK_WEIGHT_FEEDBACK * feedback,
          recency: REINFORCEMENT_RANK_WEIGHT_REINFORCEMENT_STALENESS * recency,
          humanConversations:
            REINFORCEMENT_RANK_WEIGHT_HUMAN_CONVERSATIONS * humanConversations,
          toolError: REINFORCEMENT_RANK_WEIGHT_TOOL_ERROR * toolError,
          multiUser: REINFORCEMENT_RANK_WEIGHT_MULTI_USER * multiUser,
          staleness:
            REINFORCEMENT_RANK_WEIGHT_AGENT_VERSION_FRESHNESS * staleness,
        },
      },
      "ReinforcedAgent: agent score breakdown"
    );
  }
}

function recordSelectionMetrics({
  workspaceId,
  explicitOnAgentsCount,
  autoEligibleCount,
  autoSelectedCount,
}: {
  workspaceId: string;
  explicitOnAgentsCount: number;
  autoEligibleCount: number;
  autoSelectedCount: number;
}) {
  const tags = [`workspace_id:${workspaceId}`];
  const statsd = getStatsDClient();

  statsd.increment("reinforced_agent.selection.runs.count", 1, tags);
  statsd.distribution(
    "reinforced_agent.selection.on_agents.distribution",
    explicitOnAgentsCount,
    tags
  );
  statsd.distribution(
    "reinforced_agent.selection.auto_eligible.distribution",
    autoEligibleCount,
    tags
  );
  statsd.distribution(
    "reinforced_agent.selection.auto_selected.distribution",
    autoSelectedCount,
    tags
  );
}
