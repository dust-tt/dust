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

    const [legacyResult, consumptionResult] = await Promise.all([
      searchAnalytics<never, ApiKeyCreditsAggs>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
              {
                range: {
                  timestamp: {
                    gte: parsedFromDate.toISOString(),
                    lte: parsedToDate.toISOString(),
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
              aggs: { credits: { sum: { field: "cost.billable_awu" } } },
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
                    gte: parsedFromDate.toISOString(),
                    lte: parsedToDate.toISOString(),
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

    const legacyByApiKeyName = new Map(
      bucketsToArray<ApiKeyCreditsBucket>(legacyAggregation?.buckets).map(
        (bucket) => [
          String(bucket.key),
          roundCreditsToMicroCredits(bucket.credits?.value ?? 0),
        ]
      )
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
