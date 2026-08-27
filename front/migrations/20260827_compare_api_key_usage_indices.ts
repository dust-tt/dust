/**
 * Compare per-API-key credit usage between the legacy agent-message analytics index and the
 * consumption analytics index over an explicit time window.
 *
 * This script is read-only. `--execute` only suppresses the standard migration-script dry-run
 * warning.
 *
 *   npx tsx migrations/20260827_compare_api_key_usage_indices.ts \
 *     --workspaceId <wId> \
 *     --fromDate 2026-08-01T00:00:00.000Z \
 *     --toDate 2026-08-27T00:00:00.000Z \
 *     --execute
 *
 * The legacy index is bounded by message creation time (`timestamp`), while the consumption index
 * is bounded by message completion time (`completed_at`). Messages that cross either boundary can
 * therefore produce legitimate differences.
 */
import {
  ANALYTICS_ALIAS_NAME,
  bucketsToArray,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const MAX_API_KEY_NAMES = 10_000;
const TimestampSchema = z.string().datetime({ offset: true });

type ApiKeyCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type ApiKeyCreditsTermsAggregate =
  estypes.AggregationsTermsAggregateBase<ApiKeyCreditsBucket>;

type ApiKeyCreditsAggs = {
  by_api_key_name?: ApiKeyCreditsTermsAggregate;
};

function parseTimestamp(value: string, argumentName: string): Date {
  const result = TimestampSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid --${argumentName}: ${fromError(result.error).toString()}`
    );
  }

  return new Date(result.data);
}

function assertCompleteAggregation(
  aggregation: ApiKeyCreditsTermsAggregate | undefined,
  indexName: string
): void {
  if ((aggregation?.sum_other_doc_count ?? 0) > 0) {
    throw new Error(
      `${indexName} contains more than ${MAX_API_KEY_NAMES} API key names for this window; ` +
        "the comparison would be incomplete."
    );
  }
  if ((aggregation?.doc_count_error_upper_bound ?? 0) > 0) {
    throw new Error(
      `${indexName} returned approximate API key buckets; the comparison would be incomplete.`
    );
  }
}

async function fetchCreditsMicroByApiKeyName({
  creditsField,
  creditsToMicro,
  fromDate,
  indexName,
  search,
  timestampField,
  toDate,
  workspaceId,
}: {
  creditsField: string;
  creditsToMicro: (credits: number) => number;
  fromDate: Date;
  indexName: string;
  search: typeof searchAnalytics;
  timestampField: string;
  toDate: Date;
  workspaceId: string;
}): Promise<Map<string, number>> {
  const result = await search<never, ApiKeyCreditsAggs>(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspaceId } },
          {
            range: {
              [timestampField]: {
                gte: fromDate.toISOString(),
                lte: toDate.toISOString(),
              },
            },
          },
        ],
      },
    },
    {
      aggregations: {
        by_api_key_name: {
          terms: { field: "api_key_name", size: MAX_API_KEY_NAMES },
          aggs: { credits: { sum: { field: creditsField } } },
        },
      },
      size: 0,
    }
  );
  if (result.isErr()) {
    throw new Error(`Failed to query ${indexName}: ${result.error.message}`);
  }

  const aggregation = result.value.aggregations?.by_api_key_name;
  assertCompleteAggregation(aggregation, indexName);
  return new Map(
    bucketsToArray<ApiKeyCreditsBucket>(aggregation?.buckets).map((bucket) => [
      String(bucket.key),
      creditsToMicro(bucket.credits?.value ?? 0),
    ])
  );
}

function totalMicroCredits(creditsByApiKeyName: Map<string, number>): number {
  return [...creditsByApiKeyName.values()].reduce(
    (total, creditsMicro) => total + creditsMicro,
    0
  );
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string",
      demandOption: true,
      description: "Workspace sId to compare.",
    },
    fromDate: {
      type: "string",
      demandOption: true,
      description: "Inclusive ISO-8601 start timestamp.",
    },
    toDate: {
      type: "string",
      demandOption: true,
      description: "Inclusive ISO-8601 end timestamp.",
    },
  },
  async ({ fromDate, toDate, workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const parsedFromDate = parseTimestamp(fromDate, "fromDate");
    const parsedToDate = parseTimestamp(toDate, "toDate");
    if (parsedFromDate >= parsedToDate) {
      throw new Error("--fromDate must precede --toDate");
    }

    const [legacyByApiKeyName, consumptionByApiKeyName] = await Promise.all([
      fetchCreditsMicroByApiKeyName({
        creditsField: "cost.billable_awu",
        creditsToMicro: roundCreditsToMicroCredits,
        fromDate: parsedFromDate,
        indexName: ANALYTICS_ALIAS_NAME,
        search: searchAnalytics,
        timestampField: "timestamp",
        toDate: parsedToDate,
        workspaceId: workspace.sId,
      }),
      fetchCreditsMicroByApiKeyName({
        creditsField: "credit_micro",
        creditsToMicro: Math.round,
        fromDate: parsedFromDate,
        indexName: CONSUMPTION_ANALYTICS_ALIAS_NAME,
        search: searchConsumptionAnalytics,
        timestampField: "completed_at",
        toDate: parsedToDate,
        workspaceId: workspace.sId,
      }),
    ]);
    const apiKeyNames = [
      ...new Set([
        ...legacyByApiKeyName.keys(),
        ...consumptionByApiKeyName.keys(),
      ]),
    ].sort();

    const mismatches = apiKeyNames.flatMap((apiKeyName) => {
      const legacyCreditsMicro = legacyByApiKeyName.get(apiKeyName) ?? 0;
      const consumptionCreditsMicro =
        consumptionByApiKeyName.get(apiKeyName) ?? 0;

      return legacyCreditsMicro === consumptionCreditsMicro
        ? []
        : [
            {
              apiKeyName,
              legacyCredits: microCreditsToCredits(legacyCreditsMicro),
              consumptionCredits: microCreditsToCredits(
                consumptionCreditsMicro
              ),
              deltaCredits: microCreditsToCredits(
                consumptionCreditsMicro - legacyCreditsMicro
              ),
            },
          ];
    });

    for (const mismatch of mismatches) {
      logger.warn(mismatch, "API key usage differs between analytics indices");
    }

    const legacyTotalMicroCredits = totalMicroCredits(legacyByApiKeyName);
    const consumptionTotalMicroCredits = totalMicroCredits(
      consumptionByApiKeyName
    );
    const summary = {
      workspaceId: workspace.sId,
      fromDate: parsedFromDate.toISOString(),
      toDate: parsedToDate.toISOString(),
      comparedApiKeyNames: apiKeyNames.length,
      mismatchedApiKeyNames: mismatches.length,
      legacyCredits: microCreditsToCredits(legacyTotalMicroCredits),
      consumptionCredits: microCreditsToCredits(consumptionTotalMicroCredits),
      deltaCredits: microCreditsToCredits(
        consumptionTotalMicroCredits - legacyTotalMicroCredits
      ),
    };

    if (apiKeyNames.length === 0) {
      logger.warn(summary, "No API key usage found in either analytics index");
      return;
    }

    if (mismatches.length > 0) {
      logger.error(summary, "API key usage comparison failed");
      throw new Error(`Found ${mismatches.length} API key usage mismatch(es)`);
    }

    logger.info(summary, "API key usage matches across analytics indices");
  }
);
