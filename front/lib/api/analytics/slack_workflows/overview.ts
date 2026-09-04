import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  buildConsumptionScopeQuery,
  CREDIT_MICRO_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type SlackWorkflowsOverview = {
  period: ConsumptionPeriod;
  slackWorkflowCredits: number;
  workspaceTotalCredits: number;
};

export type GetSlackWorkflowsOverviewResponse = SlackWorkflowsOverview;

// `normalized_origin` folds slack_workflow into slack, so the raw origin is the
// only way to isolate workflow consumption.
const CONTEXT_ORIGIN_FIELD = "context_origin";
const SLACK_WORKFLOW_ORIGIN = "slack_workflow";

const WORKSPACE_TOTAL_AGG = "workspace_credit_micro";
const SLACK_WORKFLOWS_AGG = "slack_workflows";
const SLACK_WORKFLOW_CREDIT_AGG = "slack_workflow_credit_micro";

type OverviewAggs = {
  [WORKSPACE_TOTAL_AGG]?: estypes.AggregationsSumAggregate;
  [SLACK_WORKFLOWS_AGG]?: {
    [SLACK_WORKFLOW_CREDIT_AGG]?: estypes.AggregationsSumAggregate;
  };
};

export async function fetchSlackWorkflowsOverview(
  auth: Authenticator,
  { period }: { period: ConsumptionPeriod }
): Promise<Result<SlackWorkflowsOverview, ElasticsearchError>> {
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const searchResult = await searchConsumptionAnalytics<never, OverviewAggs>(
    query,
    {
      aggregations: {
        [WORKSPACE_TOTAL_AGG]: { sum: { field: CREDIT_MICRO_FIELD } },
        [SLACK_WORKFLOWS_AGG]: {
          filter: {
            term: { [CONTEXT_ORIGIN_FIELD]: SLACK_WORKFLOW_ORIGIN },
          },
          aggs: {
            [SLACK_WORKFLOW_CREDIT_AGG]: {
              sum: { field: CREDIT_MICRO_FIELD },
            },
          },
        },
      },
      size: 0,
    }
  );
  if (searchResult.isErr()) {
    return searchResult;
  }

  const aggregations = searchResult.value.aggregations;

  return new Ok({
    period,
    slackWorkflowCredits: microCreditsToCredits(
      aggregations?.[SLACK_WORKFLOWS_AGG]?.[SLACK_WORKFLOW_CREDIT_AGG]?.value ??
        0
    ),
    workspaceTotalCredits: microCreditsToCredits(
      aggregations?.[WORKSPACE_TOTAL_AGG]?.value ?? 0
    ),
  });
}
