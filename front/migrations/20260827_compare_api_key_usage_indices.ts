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
const DEFAULT_DAYS = 90;
const DAY_DURATION_MS = 24 * 60 * 60 * 1000;
const DaysSchema = z.number().int().positive();

type ApiKeyCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
  by_status?: StatusCreditsTermsAggregate;
};

type StatusCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type StatusCreditsTermsAggregate =
  estypes.AggregationsTermsAggregateBase<StatusCreditsBucket>;

type ApiKeyCreditsTermsAggregate =
  estypes.AggregationsTermsAggregateBase<ApiKeyCreditsBucket>;

type ApiKeyCreditsAggs = {
  by_api_key_name?: ApiKeyCreditsTermsAggregate;
};

function parseDays(value: number): number {
  const result = DaysSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid --days: ${fromError(result.error).toString()}`);
  }

  return result.data;
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
    days: {
      type: "number",
      default: DEFAULT_DAYS,
      description: "Number of past days to compare.",
    },
  },
  async ({ days, workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const parsedDays = parseDays(days);
    const windowEnd = new Date();
    const windowStart = new Date(
      windowEnd.getTime() - parsedDays * DAY_DURATION_MS
    );

    const [legacyResult, consumptionResult] = await Promise.all([
      searchAnalytics<never, ApiKeyCreditsAggs>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
              {
                range: {
                  timestamp: {
                    gte: windowStart.toISOString(),
                    lte: windowEnd.toISOString(),
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
              aggs: {
                credits: { sum: { field: "cost.billable_awu" } },
                by_status: {
                  terms: { field: "status", size: 10 },
                  aggs: {
                    credits: { sum: { field: "cost.billable_awu" } },
                  },
                },
              },
            },
          },
          size: 0,
        }
      ),
      searchConsumptionAnalytics<never, ApiKeyCreditsAggs>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
              {
                range: {
                  completed_at: {
                    gte: windowStart.toISOString(),
                    lte: windowEnd.toISOString(),
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
              aggs: { credits: { sum: { field: "credit_micro" } } },
            },
          },
          size: 0,
        }
      ),
    ]);

    if (legacyResult.isErr()) {
      throw new Error(
        `Failed to query ${ANALYTICS_ALIAS_NAME}: ${legacyResult.error.message}`
      );
    }
    if (consumptionResult.isErr()) {
      throw new Error(
        `Failed to query ${CONSUMPTION_ANALYTICS_ALIAS_NAME}: ${consumptionResult.error.message}`
      );
    }

    const legacyAggregation = legacyResult.value.aggregations?.by_api_key_name;
    const consumptionAggregation =
      consumptionResult.value.aggregations?.by_api_key_name;
    assertCompleteAggregation(legacyAggregation, ANALYTICS_ALIAS_NAME);
    assertCompleteAggregation(
      consumptionAggregation,
      CONSUMPTION_ANALYTICS_ALIAS_NAME
    );

    const legacyBuckets = bucketsToArray<ApiKeyCreditsBucket>(
      legacyAggregation?.buckets
    );
    const legacyByApiKeyName = new Map(
      legacyBuckets.map((bucket) => [
        String(bucket.key),
        roundCreditsToMicroCredits(bucket.credits?.value ?? 0),
      ])
    );
    const legacyCreditsByStatusByApiKeyName = new Map(
      legacyBuckets.map((bucket) => [
        String(bucket.key),
        Object.fromEntries(
          bucketsToArray<StatusCreditsBucket>(bucket.by_status?.buckets).map(
            (statusBucket) => [
              String(statusBucket.key),
              statusBucket.credits?.value ?? 0,
            ]
          )
        ),
      ])
    );
    const consumptionByApiKeyName = new Map(
      bucketsToArray<ApiKeyCreditsBucket>(consumptionAggregation?.buckets).map(
        (bucket) => [String(bucket.key), Math.round(bucket.credits?.value ?? 0)]
      )
    );
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
              legacyCreditsByStatus:
                legacyCreditsByStatusByApiKeyName.get(apiKeyName) ?? {},
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
      days: parsedDays,
      fromDate: windowStart.toISOString(),
      toDate: windowEnd.toISOString(),
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
      return;
    }

    logger.info(summary, "API key usage matches across analytics indices");
  }
);
