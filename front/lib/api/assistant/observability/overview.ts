import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONVERSATION_ID_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type AgentOverview = {
  activeUsers: number;
  conversationCount: number;
  messageCount: number;
};

type OverviewAggs = {
  active_users?: { value?: number };
  conversations?: { value?: number };
  total_messages?: { value?: number };
};

export async function fetchAgentOverview(
  auth: Authenticator,
  {
    agentId,
    days,
    version,
  }: {
    agentId: string;
    days: number;
    version?: string;
  }
): Promise<Result<AgentOverview, Error>> {
  const period = await resolveConsumptionPeriod(auth, { kind: "days", days });

  const extraFilters: estypes.QueryDslQueryContainer[] = [];
  if (version) {
    extraFilters.push({ term: { "agent.version": version } });
  }

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter: { agents: [agentId] },
    extraFilters,
  });

  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      active_users: {
        cardinality: {
          field: CONSUMPTION_DIMENSION_FIELDS.user,
          precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
        },
      },
      conversations: {
        cardinality: {
          field: CONVERSATION_ID_FIELD,
          precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
        },
      },
      total_messages: {
        cardinality: {
          field: AGENT_MESSAGE_ID_FIELD,
          precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
        },
      },
    };

  const result = await searchConsumptionAnalytics<never, OverviewAggs>(query, {
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
  });
}
