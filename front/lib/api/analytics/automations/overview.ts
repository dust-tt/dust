import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  buildConsumptionScopeQuery,
  CREDIT_MICRO_FIELD,
  TRIGGER_ID_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type AutomationsOverview = {
  period: ConsumptionPeriod;
  credits: number;
  // Every credit the workspace spent over the period, automations included, so
  // the automation share can be read against it.
  workspaceCredits: number;
  triggers: {
    enabled: number;
    total: number;
  };
};

export type GetAutomationsOverviewResponse = AutomationsOverview;

const CREDIT_AGG = "credit_micro";
const AUTOMATION_AGG = "automations";

type OverviewAggs = {
  [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  [AUTOMATION_AGG]?: {
    [CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  };
};

export async function fetchAutomationsOverview(
  auth: Authenticator,
  { period }: { period: ConsumptionPeriod }
): Promise<Result<AutomationsOverview, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const [searchResult, triggerCounts] = await Promise.all([
    searchConsumptionAnalytics<never, OverviewAggs>(query, {
      aggregations: {
        [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
        [AUTOMATION_AGG]: {
          filter: { exists: { field: TRIGGER_ID_FIELD } },
          aggs: {
            [CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
          },
        },
      },
      size: 0,
    }),
    TriggerResource.countByStatus(auth),
  ]);
  if (searchResult.isErr()) {
    return searchResult;
  }

  const aggregations = searchResult.value.aggregations;

  return new Ok({
    period,
    credits: microCreditsToCredits(
      aggregations?.[AUTOMATION_AGG]?.[CREDIT_AGG]?.value ?? 0
    ),
    workspaceCredits: microCreditsToCredits(
      aggregations?.[CREDIT_AGG]?.value ?? 0
    ),
    triggers: {
      enabled: triggerCounts.enabled,
      total: Object.values(triggerCounts).reduce(
        (sum, count) => sum + count,
        0
      ),
    },
  });
}
