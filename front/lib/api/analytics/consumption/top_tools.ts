import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
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
  icon: string | null;
  credits: number;
  previousCredits: number | null;
  invocationCount: number;
  avgCreditsPerInvocation: number;
};

export type ConsumptionTopTools = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  tools: ConsumptionTopToolRow[];
};

export type GetConsumptionTopToolsResponse = ConsumptionTopTools;

export async function fetchConsumptionTopTools(
  auth: Authenticator,
  {
    period,
    limit,
    offset = 0,
    search,
    filter,
    sortOrder,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
    sortOrder?: ConsumptionTopSortOrder;
  }
): Promise<Result<ConsumptionTopTools, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "tool",
    period,
    limit,
    offset,
    search,
    filter,
    sortOrder,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, hasMore, totalCount, totalCredits } = result.value;

  // Skill enablement is orchestration rather than a user-facing tool to analyze.
  const visibleGroups = groups.filter(
    (group) => group.key !== SKILL_MANAGEMENT_SERVER_NAME
  );
  const skillManagementCredits =
    groups.find((group) => group.key === SKILL_MANAGEMENT_SERVER_NAME)
      ?.credits ?? 0;
  const rows = await resolveConsumptionGroupLabels(auth, "tool", visibleGroups);

  return new Ok({
    period,
    totalCredits: totalCredits - skillManagementCredits,
    hasMore,
    totalCount,
    tools: rows.map((row) => ({
      serverName: row.key,
      name: row.name,
      icon: row.icon ?? null,
      credits: row.credits,
      previousCredits: row.previousCredits,
      invocationCount: row.count,
      avgCreditsPerInvocation: row.avgCredits,
    })),
  });
}
