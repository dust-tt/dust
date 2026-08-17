import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
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
  previousCredits: number | null;
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
    search,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopAgents, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "agent",
    period,
    limit,
    offset,
    search,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, hasMore, totalCount, totalCredits } = result.value;

  const rows = await resolveConsumptionGroupLabels(auth, "agent", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    agents: rows.map((row) => ({
      agentId: row.key,
      name: row.name,
      pictureUrl: row.pictureUrl,
      description: row.description,
      modelId: row.modelId ?? null,
      modelDisplayName: row.modelDisplayName ?? null,
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
