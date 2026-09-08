/**
 * Compare today's programmatic usage between the old analytics index
 * (agent_message_analytics) and the new consumption analytics index
 * (agent_message_consumption_analytics) for a given workspace.
 *
 * Read-only.
 *
 *   npx tsx scripts/compare_daily_cap_es_indices.ts --workspaceId <wId>
 */
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { UsageAggregations } from "@app/lib/api/programmatic_usage/common";
import {
  getShouldTrackTokenUsageCostsESFilter,
  MARKUP_MULTIPLIER,
} from "@app/lib/api/programmatic_usage/common";
import { getTodayUsageFromESMicroUsd } from "@app/lib/api/programmatic_usage/daily_cap";
import { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

import { makeScript } from "./helpers";

/**
 * Old implementation querying agent_message_analytics index.
 * Kept here for comparison purposes.
 */
async function getTodayUsageFromOldESMicroUsd(
  auth: Authenticator
): Promise<Result<number, Error>> {
  const now = new Date();
  const todayStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  );

  const baseFilter = getShouldTrackTokenUsageCostsESFilter(auth);

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [baseFilter, { range: { timestamp: { gte: todayStartMs } } }],
    },
  };

  const result = await searchAnalytics<never, UsageAggregations>(query, {
    aggregations: {
      total_cost: { sum: { field: "tokens.cost_micro_usd" } },
    },
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(`ES query failed: ${result.error.message}`));
  }

  const rawCost = result.value.aggregations?.total_cost?.value ?? 0;
  const costWithMarkup = Math.round(rawCost * MARKUP_MULTIPLIER);
  return new Ok(costWithMarkup);
}

makeScript(
  {
    workspaceId: { alias: "w", type: "string" as const, demandOption: true },
  },
  async ({ workspaceId }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const [oldResult, newResult] = await Promise.all([
      getTodayUsageFromOldESMicroUsd(auth),
      getTodayUsageFromESMicroUsd(auth),
    ]);

    const oldValueMicroUsd = oldResult.isOk() ? oldResult.value : null;
    const newValueMicroUsd = newResult.isOk() ? newResult.value : null;

    const diffMicroUsd =
      oldValueMicroUsd !== null && newValueMicroUsd !== null
        ? newValueMicroUsd - oldValueMicroUsd
        : null;

    logger.info(
      {
        workspaceId,
        oldIndexMicroUsd: oldValueMicroUsd,
        newIndexMicroUsd: newValueMicroUsd,
        diffMicroUsd,
        oldError: oldResult.isErr() ? oldResult.error.message : undefined,
        newError: newResult.isErr() ? newResult.error.message : undefined,
      },
      "[compare_daily_cap] Results"
    );
  }
);
