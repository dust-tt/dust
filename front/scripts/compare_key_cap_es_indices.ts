/**
 * Compare last-29-days key usage between the old analytics index
 * (agent_message_analytics) and the new consumption analytics index
 * (agent_message_consumption_analytics) for a given workspace and key.
 *
 * Both implementations are replicated here rather than imported: they mirror
 * private helpers of `lib/api/programmatic_usage/key_cap.ts` and this
 * comparison is a one-off migration check.
 *
 * Read-only.
 *
 *   npx tsx scripts/compare_key_cap_es_indices.ts --workspaceId <wId> --keyModelId <keyModelId>
 */
import {
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { UsageAggregations } from "@app/lib/api/programmatic_usage/common";
import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import { USAGE_TYPE_PROGRAMMATIC } from "@app/lib/metronome/constants";
import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";

import { makeScript } from "./helpers";

const TWENTY_NINE_DAYS_MS = 29 * 24 * 60 * 60 * 1000;

/**
 * Old implementation querying the agent_message_analytics index.
 */
async function getLast29DaysKeyUsageFromOldESMicroUsd(
  key: KeyResource,
  workspace: LightWorkspaceType
): Promise<Result<number, Error>> {
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { api_key_name: key.name } },
        { term: { workspace_id: workspace.sId } },
        { range: { timestamp: { gte: Date.now() - TWENTY_NINE_DAYS_MS } } },
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
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
async function getLast29DaysKeyUsageFromNewESMicroUsd(
  key: KeyResource,
  workspace: LightWorkspaceType
): Promise<Result<number, Error>> {
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { api_key_name: key.name } },
        { term: { workspace_id: workspace.sId } },
        { range: { completed_at: { gte: Date.now() - TWENTY_NINE_DAYS_MS } } },
        { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
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
    keyModelId: { alias: "k", type: "number" as const, demandOption: true },
  },
  async ({ workspaceId, keyModelId }, logger) => {
    const workspaceResource = await WorkspaceResource.fetchById(workspaceId);
    if (!workspaceResource) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }
    const workspace = renderLightWorkspaceType({
      workspace: workspaceResource,
    });

    const key = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: keyModelId,
    });
    if (!key || !key.name) {
      logger.error({ workspaceId, keyModelId }, "Key not found or unnamed");
      return;
    }

    const [oldResult, newResult] = await Promise.all([
      getLast29DaysKeyUsageFromOldESMicroUsd(key, workspace),
      getLast29DaysKeyUsageFromNewESMicroUsd(key, workspace),
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
        keyModelId,
        oldIndexMicroUsd: oldValueMicroUsd,
        newIndexMicroUsd: newValueMicroUsd,
        diffMicroUsd,
        oldError: oldResult.isErr() ? oldResult.error.message : undefined,
        newError: newResult.isErr() ? newResult.error.message : undefined,
      },
      "[compare_key_cap] Results"
    );
  }
);
