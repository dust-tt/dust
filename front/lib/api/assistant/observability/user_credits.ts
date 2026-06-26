import {
  resolveAnalyticsAgentLabels,
  UNKNOWN_AGENT_LABEL,
} from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import {
  buildCreditsScopeQuery,
  daysToInstantRange,
} from "@app/lib/api/assistant/observability/utils";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type UserCreditAgent = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  modelDisplayName: string;
  description: string;
};

export type UserCreditRow = {
  userId: string;
  name: string;
  imageUrl: string | null;
  messageCount: number;
  credits: number;
  topAgents: UserCreditAgent[];
};

export type GetUserCreditsResponse = { users: UserCreditRow[] };

type AgentBucket = { key: string; doc_count: number };

type UserBucket = {
  key: string;
  doc_count: number;
  credits?: estypes.AggregationsSumAggregate;
  top_agents?: estypes.AggregationsMultiBucketAggregateBase<AgentBucket>;
};

type UserCreditAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<UserBucket>;
};

// Per-user AWU credits (cost.full_awu) over the last `days`: message count,
// credits, and the user's top 3 agents (with each agent's current model and
// description). Ranked by credits desc. Non-free scope and the programmatic
// "unknown" user (no attributable person) are excluded to keep this a
// real-users table. When `search` is set, the ranking is scoped to the matching
// users so matches outside the top `limit` still surface.
export async function fetchUserCreditBreakdown(
  auth: Authenticator,
  { days, limit, search }: { days: number; limit: number; search?: string }
): Promise<Result<UserCreditRow[], Error>> {
  const { startDate, endDate } = daysToInstantRange(days, "UTC");

  let includeUserIds: string[] | undefined;
  if (search) {
    const matches = await UserResource.searchUsers(auth, {
      searchTerm: search,
      offset: 0,
      limit,
    });
    if (matches.isErr()) {
      return matches;
    }
    includeUserIds = matches.value.users.map((user) => user.sId);
    if (includeUserIds.length === 0) {
      return new Ok([]);
    }
  }

  const query = buildCreditsScopeQuery(auth, {
    startDate,
    endDate,
    extraMustNot: [{ term: { user_id: "unknown" } }],
  });

  const result = await searchAnalytics<never, UserCreditAggs>(query, {
    aggregations: {
      by_user: {
        terms: {
          field: "user_id",
          size: limit,
          order: { credits: "desc" },
          ...(includeUserIds ? { include: includeUserIds } : {}),
        },
        aggs: {
          credits: { sum: { field: "cost.full_awu" } },
          top_agents: {
            terms: {
              field: "agent_id",
              size: 3,
              order: { agent_credits: "desc" },
            },
            aggs: { agent_credits: { sum: { field: "cost.full_awu" } } },
          },
        },
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<UserBucket>(
    result.value.aggregations?.by_user?.buckets
  );
  if (buckets.length === 0) {
    return new Ok([]);
  }

  const userIds = buckets.map((bucket) => String(bucket.key));
  const agentIds = Array.from(
    new Set(
      buckets.flatMap((bucket) =>
        bucketsToArray<AgentBucket>(bucket.top_agents?.buckets).map((agent) =>
          String(agent.key)
        )
      )
    )
  );

  const [users, agentLabels] = await Promise.all([
    UserResource.fetchByIds(userIds),
    resolveAnalyticsAgentLabels(auth, agentIds),
  ]);

  const usersById = new Map(users.map((user) => [user.sId, user]));

  const rows: UserCreditRow[] = buckets.map((bucket) => {
    const userId = String(bucket.key);
    const user = usersById.get(userId);

    const topAgents: UserCreditAgent[] = bucketsToArray<AgentBucket>(
      bucket.top_agents?.buckets
    ).map((agentBucket) => {
      const agentId = String(agentBucket.key);
      const label = agentLabels.get(agentId) ?? UNKNOWN_AGENT_LABEL;
      return {
        agentId,
        name: label.name,
        pictureUrl: label.pictureUrl,
        modelDisplayName: label.modelDisplayName,
        description: label.description,
      };
    });

    return {
      userId,
      name: getUserDisplayName(user),
      imageUrl: user?.imageUrl ?? null,
      messageCount: bucket.doc_count,
      credits: Math.round(bucket.credits?.value ?? 0),
      topAgents,
    };
  });

  return new Ok(rows);
}
