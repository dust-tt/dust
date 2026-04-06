import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { estypes } from "@elastic/elasticsearch";

export interface ReinforcementAutoTrackSignals {
  feedbackCountByAgentSId: Map<string, number>;
  humanConversationSIdsByAgent: Map<string, string[]>;
  agentSIdsWithRecentPendingSuggestions: Set<string>;
}

type ReinforcementSignalAggs = {
  by_agent: estypes.AggregationsTermsAggregateBase<{
    key: string;
    doc_count: number;
    user_count: estypes.AggregationsCardinalityAggregate;
    tool_errors: {
      errored: {
        doc_count: number;
        back_to_root: {
          distinct_conversations: estypes.AggregationsCardinalityAggregate;
        };
      };
    };
  }>;
};

/**
 * Fetches distinct user counts and tool-error conversation counts per agent
 * from the analytics index. Call this after eligibility filtering so the query
 * is scoped to only the agents that will actually be scored.
 */
export async function fetchDistinctUsersAndToolErrorCounts(
  workspaceId: string,
  agentSIds: string[],
  lookbackWindowDays: number
): Promise<{
  distinctUserCountByAgentSId: Map<string, number>;
  toolErrorCountByAgentSId: Map<string, number>;
}> {
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { terms: { agent_id: agentSIds } },
        {
          range: {
            timestamp: { gte: `now-${lookbackWindowDays}d/d` },
          },
        },
      ],
    },
  };

  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      by_agent: {
        terms: { field: "agent_id", size: agentSIds.length + 1 },
        aggs: {
          user_count: { cardinality: { field: "user_id" } },
          tool_errors: {
            nested: { path: "tools_used" },
            aggs: {
              errored: {
                filter: {
                  bool: {
                    must_not: { term: { "tools_used.status": "succeeded" } },
                  },
                },
                aggs: {
                  back_to_root: {
                    reverse_nested: {},
                    aggs: {
                      distinct_conversations: {
                        cardinality: { field: "conversation_id" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

  const result = await searchAnalytics<never, ReinforcementSignalAggs>(query, {
    aggregations,
    size: 0,
  });

  if (result.isErr()) {
    throw new Error(`Analytics signals query failed: ${result.error.message}`);
  }

  const distinctUserCountByAgentSId = new Map<string, number>();
  const toolErrorCountByAgentSId = new Map<string, number>();

  const buckets = result.value.aggregations?.by_agent?.buckets;
  if (buckets && Array.isArray(buckets)) {
    for (const bucket of buckets) {
      distinctUserCountByAgentSId.set(
        bucket.key,
        bucket.user_count?.value ?? 0
      );
      toolErrorCountByAgentSId.set(
        bucket.key,
        bucket.tool_errors?.errored?.back_to_root?.distinct_conversations
          ?.value ?? 0
      );
    }
  }

  return { distinctUserCountByAgentSId, toolErrorCountByAgentSId };
}

export async function fetchReinforcementAutoTrackSignals(
  auth: Authenticator,
  {
    agentSIds,
    lookbackWindowDays,
    pendingSuggestionMaxAgeDays,
  }: {
    agentSIds: string[];
    lookbackWindowDays: number;
    pendingSuggestionMaxAgeDays: number;
  }
): Promise<ReinforcementAutoTrackSignals> {
  if (agentSIds.length === 0) {
    return {
      feedbackCountByAgentSId: new Map(),
      humanConversationSIdsByAgent: new Map(),
      agentSIdsWithRecentPendingSuggestions: new Set(),
    };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackWindowDays);

  const pendingSuggestionCutoff = new Date();
  pendingSuggestionCutoff.setDate(
    pendingSuggestionCutoff.getDate() - pendingSuggestionMaxAgeDays
  );

  const [feedbackCounts, humanConvSIdsByAgent, pendingSuggestions] =
    await Promise.all([
      AgentMessageFeedbackResource.getFeedbackCountForAssistants(
        auth,
        agentSIds,
        lookbackWindowDays
      ),
      ConversationResource.getConversationSIdsByAgent(auth, {
        agentSIds,
        cutoffDate,
        excludeHumanOutOfTheLoop: true,
      }),
      AgentSuggestionResource.listByAgentConfigurationIds(auth, agentSIds, {
        states: ["pending"],
        sources: ["reinforcement"],
        createdAfter: pendingSuggestionCutoff,
      }),
    ]);

  const feedbackCountByAgentSId = new Map<string, number>();
  for (const row of feedbackCounts) {
    const prev = feedbackCountByAgentSId.get(row.agentConfigurationId) ?? 0;
    feedbackCountByAgentSId.set(row.agentConfigurationId, prev + row.count);
  }

  return {
    feedbackCountByAgentSId,
    humanConversationSIdsByAgent: humanConvSIdsByAgent,
    agentSIdsWithRecentPendingSuggestions: new Set(
      pendingSuggestions.map((s) => s.agentConfigurationSId)
    ),
  };
}
