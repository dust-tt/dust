import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  avgCreditsPerUnit,
  fetchConsumptionTopGroups,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Agents ranked by the credits they consumed over the period, averaged per
 * message: an agent's credits are spread over the messages it answered, so the
 * average is what one of its messages costs.
 */

export type ConsumptionTopAgentRow = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  description: string | null;
  modelId: string | null;
  modelDisplayName: string | null;
  credits: number;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopAgents = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  agents: ConsumptionTopAgentRow[];
};

export type GetConsumptionTopAgentsResponse = ConsumptionTopAgents;

export async function fetchConsumptionTopAgents(
  auth: Authenticator,
  {
    period,
    limit,
    offset = 0,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopAgents, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "agent",
    period,
    limit,
    offset,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, hasMore, totalCount, totalCredits } = result.value;

  const labels = await resolveDimensionLabels(
    auth,
    "agent",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    agents: groups.map((group) => ({
      agentId: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      pictureUrl: labels.get(group.key)?.pictureUrl ?? null,
      description: labels.get(group.key)?.description ?? null,
      modelId: labels.get(group.key)?.modelId ?? null,
      modelDisplayName: labels.get(group.key)?.modelDisplayName ?? null,
      credits: group.credits,
      messageCount: group.count,
      avgCreditsPerMessage: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
