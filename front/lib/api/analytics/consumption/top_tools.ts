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
 * Tools ranked by the credits they consumed over the period, averaged per
 * invocation: a tool only ever appears on tool documents, one per call, and a
 * single message can call the same tool many times, so per invocation is the
 * only average that says anything about the tool itself.
 *
 * The rows do not add up to the period's total: tool documents carry the direct
 * charge and the footprint the tool result adds, but not the model work around
 * them, which is the bulk of the consumption and belongs to the LLM documents.
 */

export type ConsumptionTopToolRow = {
  // The MCP server name, which is also what the `tool` filter takes.
  serverName: string;
  name: string;
  credits: number;
  invocationCount: number;
  avgCreditsPerInvocation: number;
};

export type ConsumptionTopTools = {
  period: ConsumptionPeriod;
  totalCredits: number;
  // Highest credits first.
  tools: ConsumptionTopToolRow[];
};

export type GetConsumptionTopToolsResponse = ConsumptionTopTools;

export async function fetchConsumptionTopTools(
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
): Promise<Result<ConsumptionTopTools, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "tool",
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
    "tool",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    tools: groups.map((group) => ({
      serverName: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      credits: group.credits,
      invocationCount: group.count,
      avgCreditsPerInvocation: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
