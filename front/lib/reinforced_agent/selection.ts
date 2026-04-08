import type { Authenticator } from "@app/lib/auth";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import {
  DEFAULT_MAX_AUTO_AGENTS_PER_RUN,
  DEFAULT_MAX_CONVERSATIONS_PER_AGENT,
  DEFAULT_MIN_CONVERSATIONS_TO_INCLUDE,
  DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS,
  DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
  DEFAULT_TOTAL_CONVERSATIONS_TO_ANALYZE,
} from "./constants";
import { filterEligibleAgents } from "./eligibility";
import {
  fetchDistinctUsersAndToolErrorCounts,
  fetchReinforcementAutoTrackSignals,
  type ReinforcementAutoTrackSignals,
} from "./signals";

// Maximum days since agent configuration update to consider it "stale".
const AGENT_UPDATE_STALENESS_WINDOW_CLAMP = 90;

export interface AgentSelectionResult {
  agentConfigurationId: string;
  conversationsToSample: number;
}

export interface SelectionOptions {
  maxConversationsPerAgent?: number;
  maxAutoAgentsPerRun?: number;
  totalAutoConversationPool?: number;
  minConversationsToInclude?: number;
  includeAutoAgents?: boolean;
}

interface ReinforcementSelectionInput {
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

type NormalizedSignals = ScoredAgent["normalized"];

type ContributionLogKey =
  | "feedback"
  | "recency"
  | "humanConversations"
  | "toolError"
  | "multiUser"
  | "staleness";

const SCORING_SIGNAL_ROWS: {
  logKey: ContributionLogKey;
  weight: number;
  prefix: string;
  normalizedSuffix?: string;
  value: (n: NormalizedSignals) => number;
}[] = [
  {
    logKey: "feedback",
    weight: 0.3,
    prefix: "feedback",
    value: (n) => n.feedback,
  },
  {
    logKey: "recency",
    weight: 0.2, // Favors agents not recently reinforced
    prefix: "recency",
    value: (n) => n.reinforcementStaleness,
  },
  {
    logKey: "humanConversations",
    weight: 0.2,
    prefix: "human_conversations",
    value: (n) => n.humanConversations,
  },
  {
    logKey: "toolError",
    weight: 0.1,
    prefix: "tool_error",
    value: (n) => n.toolError,
  },
  {
    logKey: "multiUser",
    weight: 0.1,
    prefix: "multi_user",
    value: (n) => n.multiUser,
  },
  {
    logKey: "staleness",
    weight: 0.1, // Favors recently updated configs
    prefix: "staleness",
    normalizedSuffix: "staleness_score",
    value: (n) => n.staleness,
  },
];

/**
 * Determines which agents will be run and how many conversations to sample for each.
 *
 * - Agents in `on` mode — Each gets `maxConversationsPerAgent`. Does not consume `maxAutoAgentsPerRun`.
 * - Agents in `auto` mode — Prioritized based on a scoring system up to `maxAutoAgentsPerRun`.
 *
 * Each agent is assigned a score, then conversation counts are split in proportion to those scores among the agents that are selected.
 */
export async function selectAgentsForReinforcementPipeline(
  auth: Authenticator,
  agents: LightAgentConfigurationType[],
  options: SelectionOptions = {}
): Promise<AgentSelectionResult[]> {
  const includeAutoAgents = options.includeAutoAgents ?? true;

  const inScope = agents.filter((a) => a.id > 0 && a.reinforcement !== "off");
  const explicitOnAgents = inScope.filter((a) => a.reinforcement === "on");

  if (!includeAutoAgents) {
    return computeReinforcementSelections(auth, {
      explicitOnAgents,
      eligibleAutoAgents: [],
      signals: {
        feedbackCountByAgentId: new Map(),
        humanConversationSIdsByAgent: new Map(),
        agentIdsWithRecentPendingSuggestions: new Set(),
      },
      options,
    });
  }

  const autoAgents = inScope.filter((a) => a.reinforcement === "auto");

  const signals = await fetchReinforcementAutoTrackSignals(auth, {
    agentIds: autoAgents.map((a) => a.sId),
    lookbackWindowDays: DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
    pendingSuggestionMaxAgeDays: DEFAULT_PENDING_SUGGESTION_MAX_AGE_DAYS,
  });

  const eligibleAutoAgents = filterEligibleAgents(auth, autoAgents, signals);

  return computeReinforcementSelections(auth, {
    explicitOnAgents,
    eligibleAutoAgents,
    signals,
    options,
  });
}

/** Scores eligible auto agents and splits the conversation pool; `on` agents are passed through unchanged. */
async function computeReinforcementSelections(
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

  const { distinctUserCountByAgentId, toolErrorCountByAgentId } =
    await fetchDistinctUsersAndToolErrorCounts(
      workspaceId,
      eligibleAutoAgents.map((a) => a.sId),
      DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS
    );

  const feedbackCountMap = signals.feedbackCountByAgentId;
  const humanConvsByAgent = signals.humanConversationSIdsByAgent;

  const rawByAgent = eligibleAutoAgents.map((agent) => ({
    agent,
    feedback: feedbackCountMap.get(agent.sId) ?? 0,
    humanConversations: humanConvsByAgent.get(agent.sId)?.length ?? 0,
    toolError: toolErrorCountByAgentId.get(agent.sId) ?? 0,
    multiUser: distinctUserCountByAgentId.get(agent.sId) ?? 0,
  }));

  const maxFeedback = Math.max(0, ...rawByAgent.map((r) => r.feedback));
  const maxHumanConversations = Math.max(
    0,
    ...rawByAgent.map((r) => r.humanConversations)
  );
  const maxToolError = Math.max(0, ...rawByAgent.map((r) => r.toolError));
  const maxMultiUser = Math.max(0, ...rawByAgent.map((r) => r.multiUser));

  const now = Date.now();
  const scored: ScoredAgent[] = rawByAgent.map(({ agent, ...raw }) =>
    scoreAutoAgent(agent, raw, {
      maxFeedback,
      maxHumanConversations,
      maxToolError,
      maxMultiUser,
      now,
    })
  );

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

function normalize(value: number, max: number): number {
  return max === 0 ? 0 : value / max;
}

function scoreAutoAgent(
  agent: LightAgentConfigurationType,
  raw: {
    feedback: number;
    humanConversations: number;
    toolError: number;
    multiUser: number;
  },
  {
    maxFeedback,
    maxHumanConversations,
    maxToolError,
    maxMultiUser,
    now,
  }: {
    maxFeedback: number;
    maxHumanConversations: number;
    maxToolError: number;
    maxMultiUser: number;
    now: number;
  }
): ScoredAgent {
  const versionCreatedAt = agent.versionCreatedAt
    ? new Date(agent.versionCreatedAt).getTime()
    : null;
  const daysSinceConfigUpdate = versionCreatedAt
    ? (now - versionCreatedAt) / (1000 * 60 * 60 * 24)
    : AGENT_UPDATE_STALENESS_WINDOW_CLAMP;

  const normalized: NormalizedSignals = {
    feedback: normalize(raw.feedback, maxFeedback),
    // TODO(dust-tt/tasks#7313): static placeholder until we persist last reinforcement time per agent.
    reinforcementStaleness: 1,
    humanConversations: normalize(
      raw.humanConversations,
      maxHumanConversations
    ),
    toolError: normalize(raw.toolError, maxToolError),
    multiUser: normalize(raw.multiUser, maxMultiUser),
    // Recency score: 1 right after a version bump, decays to 0 over the clamp window.
    staleness: Math.max(
      0,
      Math.min(
        1,
        1 - daysSinceConfigUpdate / AGENT_UPDATE_STALENESS_WINDOW_CLAMP
      )
    ),
  };

  const score = SCORING_SIGNAL_ROWS.reduce(
    (sum, row) => sum + row.weight * row.value(normalized),
    0
  );

  return { agent, score, normalized };
}

function recordAgentScoringMetrics(
  workspaceId: string,
  scored: ScoredAgent[],
  selectedAllocations: Map<string, number>
) {
  const tags = [`workspace_id:${workspaceId}`];
  const statsd = getStatsDClient();

  for (const { agent, score, normalized } of scored) {
    const conversationsToSample = selectedAllocations.get(agent.sId) ?? null;
    const wasSelected = conversationsToSample !== null;

    for (const row of SCORING_SIGNAL_ROWS) {
      const v = row.value(normalized);
      statsd.distribution(
        `reinforced_agent.scoring.${row.normalizedSuffix ?? `${row.prefix}_normalized`}`,
        v,
        tags
      );
      statsd.distribution(
        `reinforced_agent.scoring.${row.prefix}_contribution`,
        row.weight * v,
        tags
      );
    }

    statsd.distribution("reinforced_agent.scoring.total_score", score, tags);

    if (wasSelected && conversationsToSample !== null) {
      statsd.distribution(
        "reinforced_agent.scoring.conversations_to_sample",
        conversationsToSample,
        tags
      );
    }

    const contributions = Object.fromEntries(
      SCORING_SIGNAL_ROWS.map((row) => [
        row.logKey,
        row.weight * row.value(normalized),
      ])
    );

    logger.info(
      {
        workspaceId,
        agentConfigurationId: agent.sId,
        score,
        wasSelected,
        conversationsToSample,
        normalized: {
          feedback: normalized.feedback,
          recency: normalized.reinforcementStaleness,
          humanConversations: normalized.humanConversations,
          toolError: normalized.toolError,
          multiUser: normalized.multiUser,
          staleness: normalized.staleness,
        },
        contributions,
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
