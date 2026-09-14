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
  automationCredits: number;
  // Automations included, so the automation share can be read against it.
  workspaceTotalCredits: number;
  triggers: {
    enabled: number;
    total: number;
    workspacePool: number;
  };
};

export type GetAutomationsOverviewResponse = AutomationsOverview;

const WORKSPACE_TOTAL_AGG = "workspace_credit_micro";
const AUTOMATIONS_AGG = "automations";
const AUTOMATION_CREDIT_AGG = "automation_credit_micro";

type OverviewAggs = {
  [WORKSPACE_TOTAL_AGG]?: estypes.AggregationsSumAggregate;
  [AUTOMATIONS_AGG]?: {
    [AUTOMATION_CREDIT_AGG]?: estypes.AggregationsSumAggregate;
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
        [WORKSPACE_TOTAL_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
        [AUTOMATIONS_AGG]: {
          filter: { exists: { field: TRIGGER_ID_FIELD } },
          aggs: {
            [AUTOMATION_CREDIT_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
          },
        },
      },
      size: 0,
    }),
    TriggerResource.countForWorkspace(auth),
  ]);
  if (searchResult.isErr()) {
    return searchResult;
  }

  const aggregations = searchResult.value.aggregations;

  return new Ok({
    period,
    automationCredits: microCreditsToCredits(
      aggregations?.[AUTOMATIONS_AGG]?.[AUTOMATION_CREDIT_AGG]?.value ?? 0
    ),
    workspaceTotalCredits: microCreditsToCredits(
      aggregations?.[WORKSPACE_TOTAL_AGG]?.value ?? 0
    ),
    triggers: triggerCounts,
  });
}
