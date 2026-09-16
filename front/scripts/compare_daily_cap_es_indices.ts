/**
 * Compare today's programmatic usage between the old analytics index
 * (agent_message_analytics) and the new consumption analytics index
 * (agent_message_consumption_analytics) for a given workspace.
 *
 * Both implementations are replicated here rather than imported: they mirror
 * private helpers of `lib/api/programmatic_usage/daily_cap.ts` and this
 * comparison is a one-off migration check.
 *
 * Read-only.
 *
 *   npx tsx scripts/compare_daily_cap_es_indices.ts --workspaceId <wId>
 */
import {
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { UsageAggregations } from "@app/lib/api/programmatic_usage/common";
import {
  getShouldTrackTokenUsageCostsESFilter,
  MARKUP_MULTIPLIER,
} from "@app/lib/api/programmatic_usage/common";
import { Authenticator } from "@app/lib/auth";
import { USAGE_TYPE_PROGRAMMATIC } from "@app/lib/metronome/constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

import { makeScript } from "./helpers";

function getTodayStartMs(): number {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0
  );
}

/**
 * Old implementation querying the agent_message_analytics index.
 */
async function getTodayUsageFromOldESMicroUsd(
  auth: Authenticator
): Promise<Result<number, Error>> {
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        getShouldTrackTokenUsageCostsESFilter(auth),
        { range: { timestamp: { gte: getTodayStartMs() } } },
      ],
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

  const rawCostMicroUsd = result.value.aggregations?.total_cost?.value ?? 0;
  const costWithMarkupMicroUsd = Math.round(
    rawCostMicroUsd * MARKUP_MULTIPLIER
  );
  return new Ok(costWithMarkupMicroUsd);
}

/**
 * New implementation querying the agent_message_consumption_analytics index.
 */
async function getTodayUsageFromNewESMicroUsd(
  auth: Authenticator
): Promise<Result<number, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspace.sId } },
        { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
        { range: { completed_at: { gte: getTodayStartMs() } } },
      ],
    },
  };

  const result = await searchConsumptionAnalytics<never, UsageAggregations>(
    query,
    {
      aggregations: {
        total_cost: { sum: { field: "micro_usd" } },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return new Err(new Error(`ES query failed: ${result.error.message}`));
  }

  const rawCostMicroUsd = result.value.aggregations?.total_cost?.value ?? 0;
  const costWithMarkupMicroUsd = Math.round(
    rawCostMicroUsd * MARKUP_MULTIPLIER
  );
  return new Ok(costWithMarkupMicroUsd);
}

makeScript(
  {
    workspaceId: { alias: "w", type: "string" as const, demandOption: true },
  },
  async ({ workspaceId }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    const [oldResult, newResult] = await Promise.all([
      getTodayUsageFromOldESMicroUsd(auth),
      getTodayUsageFromNewESMicroUsd(auth),
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
