import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  avgCreditsPerUnit,
  fetchConsumptionTopGroups,
} from "@app/lib/api/analytics/consumption/top";
import type { AgentVisibilityScope } from "@app/lib/api/assistant/observability/agent_labels";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { resolveDimensionLabels } from "./labels";

/**
 * Agents ranked by the credits they consumed over the period, averaged per
 * message: an agent's credits are spread over the messages it answered, so the
 * average is what one of its messages costs.
 */

export type ConsumptionTopAgentRow = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  scope: AgentVisibilityScope;
  credits: number;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopAgents = {
  period: ConsumptionPeriod;
  totalCredits: number;
  // Highest credits first.
  agents: ConsumptionTopAgentRow[];
};

export type GetConsumptionTopAgentsResponse = ConsumptionTopAgents;

export async function fetchConsumptionTopAgents(
  auth: Authenticator,
  {
    period,
    limit,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopAgents, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "agent",
    unit: "message",
    period,
    limit,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, totalCredits } = result.value;

  const labels = await resolveDimensionLabels(
    auth,
    "agent",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    agents: groups.map((group) => ({
      agentId: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      pictureUrl: labels.get(group.key)?.pictureUrl ?? null,
      scope: labels.get(group.key)?.scope ?? "private",
      credits: group.credits,
      messageCount: group.count,
      avgCreditsPerMessage: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
