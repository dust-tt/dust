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
 * API key names ranked by the credits they consumed over the period, averaged
 * per distinct message. API key names are not unique, so all keys sharing a
 * name intentionally contribute to the same row.
 */

export type ConsumptionTopApiKeyRow = {
  apiKeyName: string;
  name: string;
  credits: number;
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopApiKeys = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  apiKeys: ConsumptionTopApiKeyRow[];
};

export type GetConsumptionTopApiKeysResponse = ConsumptionTopApiKeys;

export async function fetchConsumptionTopApiKeys(
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
): Promise<Result<ConsumptionTopApiKeys, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "api_key",
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

  const rows = await resolveConsumptionGroupLabels(auth, "api_key", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    apiKeys: rows.map((row) => ({
      apiKeyName: row.key,
      name: row.name,
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
