/**
 * Compare the programmatic AWU usage returned by the legacy and consumption
 * analytics indices for a workspace's current billing cycle.
 *
 * npx tsx migrations/20260901_compare_programmatic_usage_indices.ts \
 *   --workspaceId <wId>
 */
import {
  ANALYTICS_ALIAS_NAME,
  bucketsToArray,
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { getProgrammaticUsageFilterClause } from "@app/lib/api/programmatic_usage/common";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { USAGE_TYPE_PROGRAMMATIC } from "@app/lib/metronome/constants";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { estypes } from "@elastic/elasticsearch";

const STATUS_BUCKET_SIZE = 10;

type StatusCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type ProgrammaticCreditsAggregations = {
  credits?: estypes.AggregationsSumAggregate;
  by_status?: estypes.AggregationsTermsAggregateBase<StatusCreditsBucket>;
};

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: true,
      description: "Workspace sId to compare.",
      type: "string" as const,
    },
  },
  async ({ workspaceId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const periodResult = await getCachedMetronomeCurrentBillingPeriod(
      workspace.sId
    );
    if (periodResult.isErr()) {
      throw periodResult.error;
    }
    if (!periodResult.value) {
      throw new Error(
        `No current billing period for workspace: ${workspaceId}`
      );
    }

    const { cycleEnd, cycleStart } = periodResult.value;
    const [legacyResult, consumptionResult] = await Promise.all([
      searchAnalytics<never, ProgrammaticCreditsAggregations>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
              getProgrammaticUsageFilterClause(),
              {
                range: {
                  timestamp: {
                    gte: cycleStart.toISOString(),
                    lte: cycleEnd.toISOString(),
                  },
                },
              },
            ],
          },
        },
        {
          aggregations: {
            credits: { sum: { field: "cost.billable_awu" } },
            by_status: {
              terms: { field: "status", size: STATUS_BUCKET_SIZE },
              aggs: {
                credits: { sum: { field: "cost.billable_awu" } },
              },
            },
          },
          size: 0,
        }
      ),
      searchConsumptionAnalytics<never, ProgrammaticCreditsAggregations>(
        {
          bool: {
            filter: [
              { term: { workspace_id: workspace.sId } },
              { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
              {
                range: {
                  completed_at: {
                    gte: cycleStart.toISOString(),
                    lte: cycleEnd.toISOString(),
                  },
                },
              },
            ],
          },
        },
        {
          aggregations: {
            credits: { sum: { field: "credit_micro" } },
            by_status: {
              terms: { field: "status", size: STATUS_BUCKET_SIZE },
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

    const legacyAggregations = legacyResult.value.aggregations;
    const consumptionAggregations = consumptionResult.value.aggregations;
    const legacyAwuCredits = Math.max(
      0,
      legacyAggregations?.credits?.value ?? 0
    );
    const consumptionMicroCredits = Math.max(
      0,
      Math.round(consumptionAggregations?.credits?.value ?? 0)
    );
    const consumptionAwuCredits = microCreditsToCredits(
      consumptionMicroCredits
    );
    const legacyRoundedAwuCredits = Math.round(legacyAwuCredits);
    const consumptionRoundedAwuCredits = Math.round(consumptionAwuCredits);
    const roundedAwuCreditsDifference =
      consumptionRoundedAwuCredits - legacyRoundedAwuCredits;

    const summary = {
      workspaceId: workspace.sId,
      cycleStart: cycleStart.toISOString(),
      cycleEnd: cycleEnd.toISOString(),
      legacy: {
        awuCredits: legacyAwuCredits,
        roundedAwuCredits: legacyRoundedAwuCredits,
        awuCreditsByStatus: Object.fromEntries(
          bucketsToArray<StatusCreditsBucket>(
            legacyAggregations?.by_status?.buckets
          ).map((bucket) => [String(bucket.key), bucket.credits?.value ?? 0])
        ),
      },
      consumption: {
        microCredits: consumptionMicroCredits,
        awuCredits: consumptionAwuCredits,
        roundedAwuCredits: consumptionRoundedAwuCredits,
        awuCreditsByStatus: Object.fromEntries(
          bucketsToArray<StatusCreditsBucket>(
            consumptionAggregations?.by_status?.buckets
          ).map((bucket) => [
            String(bucket.key),
            microCreditsToCredits(Math.round(bucket.credits?.value ?? 0)),
          ])
        ),
      },
      awuCreditsDifference: consumptionAwuCredits - legacyAwuCredits,
      roundedAwuCreditsDifference,
      matchesConsumerValue: roundedAwuCreditsDifference === 0,
    };

    if (roundedAwuCreditsDifference !== 0) {
      logger.error(
        summary,
        "Programmatic usage consumer values differ between analytics indices"
      );
      return;
    }

    logger.info(
      summary,
      "Programmatic usage consumer values match across analytics indices"
    );
  }
);
