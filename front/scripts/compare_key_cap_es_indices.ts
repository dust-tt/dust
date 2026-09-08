/**
 * Compare last-29-days key usage between the old analytics index
 * (agent_message_analytics) and the new consumption analytics index
 * (agent_message_consumption_analytics) for a given workspace and key.
 *
 * Read-only.
 *
 *   npx tsx scripts/compare_key_cap_es_indices.ts --workspaceId <wId> --keyId <keyModelId>
 */
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { UsageAggregations } from "@app/lib/api/programmatic_usage/common";
import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import { getLast29DaysKeyUsageMicroUsd } from "@app/lib/api/programmatic_usage/key_cap";
import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";

import { makeScript } from "./helpers";

/**
 * Old implementation querying agent_message_analytics index.
 * Kept here for comparison purposes.
 */
async function getLast29DaysKeyUsageFromOldESMicroUsd(
  keyId: ModelId,
  workspace: LightWorkspaceType
): Promise<Result<number, Error>> {
  const key = await KeyResource.fetchByWorkspaceAndId({ workspace, id: keyId });

  if (!key || !key.name) {
    return new Ok(0);
  }

  const twentyNineDaysAgoMs = Date.now() - 29 * 24 * 60 * 60 * 1000;

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { api_key_name: key.name } },
        { term: { workspace_id: workspace.sId } },
        { range: { timestamp: { gte: twentyNineDaysAgoMs } } },
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

  const rawCost = result.value.aggregations?.total_cost?.value ?? 0;
  const costWithMarkup = Math.round(rawCost * MARKUP_MULTIPLIER);
  return new Ok(costWithMarkup);
}

makeScript(
  {
    workspaceId: { alias: "w", type: "string" as const, demandOption: true },
    keyId: { alias: "k", type: "number" as const, demandOption: true },
  },
  async ({ workspaceId, keyId: rawKeyId }, logger) => {
    const keyId = rawKeyId as ModelId;

    const workspaceResource = await WorkspaceResource.fetchById(workspaceId);
    if (!workspaceResource) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }
    const workspace = renderLightWorkspaceType({
      workspace: workspaceResource,
    });

    const [oldResult, newResult] = await Promise.all([
      getLast29DaysKeyUsageFromOldESMicroUsd(keyId, workspace),
      getLast29DaysKeyUsageMicroUsd(keyId, workspace),
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
        keyId,
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
