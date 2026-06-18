import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { frontSequelize } from "@app/lib/resources/storage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import { QueryTypes } from "sequelize";

export type AgentCostStats = {
  totalCostCredits: number | null;
  avgCostCredits: number | null;
  medianCostCredits: number | null;
};

export type AgentOverview = {
  activeUsers: number;
  conversationCount: number;
  messageCount: number;
  positiveFeedbacks: number;
  negativeFeedbacks: number;
  costs: AgentCostStats;
};

type OverviewAggs = {
  active_users?: { value?: number };
  conversations?: { value?: number };
  total_messages?: { value?: number };
  feedbacks?: {
    recent?: {
      doc_count: number;
      up?: { doc_count: number };
      down?: { doc_count: number };
    };
  };
};

export async function fetchAgentOverview(
  baseQuery: estypes.QueryDslQueryContainer,
  days: number
): Promise<Result<AgentOverview, Error>> {
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      active_users: { cardinality: { field: "user_id" } },
      conversations: { cardinality: { field: "conversation_id" } },
      total_messages: { value_count: { field: "message_id" } },
      feedbacks: {
        nested: { path: "feedbacks" },
        aggs: {
          recent: {
            filter: {
              range: { "feedbacks.created_at": { gte: `now-${days}d/d` } },
            },
            aggs: {
              up: { filter: { term: { "feedbacks.thumb_direction": "up" } } },
              down: {
                filter: { term: { "feedbacks.thumb_direction": "down" } },
              },
            },
          },
        },
      },
    };

  const result = await searchAnalytics<never, OverviewAggs>(baseQuery, {
    aggregations,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const aggs = result.value.aggregations;

  return new Ok({
    activeUsers: Math.round(aggs?.active_users?.value ?? 0),
    conversationCount: Math.round(aggs?.conversations?.value ?? 0),
    messageCount: Math.round(aggs?.total_messages?.value ?? 0),
    positiveFeedbacks: Math.round(aggs?.feedbacks?.recent?.up?.doc_count ?? 0),
    negativeFeedbacks: Math.round(
      aggs?.feedbacks?.recent?.down?.doc_count ?? 0
    ),
    costs: {
      totalCostCredits: null,
      avgCostCredits: null,
      medianCostCredits: null,
    },
  });
}

const EMPTY_COST_STATS: AgentCostStats = {
  totalCostCredits: null,
  avgCostCredits: null,
  medianCostCredits: null,
};

// Returns cost stats (total, avg, median credits) per agent for the given time
// window. Accepts a list so the same query backs both the single-agent Insights
// tab and the multi-agent Top Agents table.
export async function fetchAgentCostStats(
  workspace: LightWorkspaceType,
  agentIds: string[],
  cutoff: Date,
  version?: number
): Promise<Map<string, AgentCostStats>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const versionClause =
    version !== undefined ? `AND "agentConfigurationVersion" = :version` : "";

  // biome-ignore lint/plugin/noRawSql: PERCENTILE_CONT with GROUP BY has no Sequelize aggregate equivalent.
  const rows = await frontSequelize.query<{
    agent_configuration_id: string;
    total_cost_credits: number | null;
    avg_cost_credits: number | null;
    median_cost_credits: number | null;
  }>(
    `SELECT
      "agentConfigurationId" AS agent_configuration_id,
      SUM("costCredits")::float AS total_cost_credits,
      AVG("costCredits")::float AS avg_cost_credits,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "costCredits")::float AS median_cost_credits
    FROM agent_messages
    WHERE "workspaceId" = :workspaceId
      AND "agentConfigurationId" IN (:agentIds)
      AND "createdAt" >= :cutoff
      AND "costCredits" IS NOT NULL
      ${versionClause}
    GROUP BY "agentConfigurationId"`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceId: workspace.id,
        agentIds,
        cutoff,
        version,
      },
    }
  );

  return new Map(
    rows.map((row) => [
      row.agent_configuration_id,
      {
        totalCostCredits: row.total_cost_credits,
        avgCostCredits: row.avg_cost_credits,
        medianCostCredits: row.median_cost_credits,
      },
    ])
  );
}

export function getAgentCostStats(
  map: Map<string, AgentCostStats>,
  agentId: string
): AgentCostStats {
  return map.get(agentId) ?? EMPTY_COST_STATS;
}

export type GetAgentOverviewResponseBody = {
  activeUsers: number;
  mentions: {
    messageCount: number;
    conversationCount: number;
    timePeriodSec: number;
  };
  feedbacks: {
    positiveFeedbacks: number;
    negativeFeedbacks: number;
    timePeriodSec: number;
  };
  costs: AgentCostStats;
};
