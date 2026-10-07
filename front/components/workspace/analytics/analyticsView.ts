import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import { describeUsageFilter } from "@app/components/workspace/analytics/usageFilter";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  consumptionGranularityLabel,
  consumptionPeriodLabel,
} from "@app/lib/analytics/consumption_period";

const BREAKDOWN_LABEL: Record<ConsumptionDimension, string> = {
  agent: "Agents",
  user: "Members",
  group: "Groups",
  model: "Models",
  tool: "Tools",
  skill: "Skills",
  source: "Sources",
  trigger: "Triggers",
  api_key: "API keys",
};

export interface AnalyticsViewInput {
  dimension: ConsumptionDimension;
  filter: UsageFilter;
  granularity: ConsumptionGranularity;
  period: ConsumptionPeriodSelection;
}

/**
 * @cc [owner:achilleburah,label:product] describes-what-is-on-screen
 * The returned text matches the view the user is looking at: period, granularity and
 * breakdown use the English source text of their selector labels, and every selected filter
 * appears under its display name. When the facets endpoint has no name for an entity it returns
 * the id as the label, so an id can show up, but the filter is never dropped.
 */
/**
 * @cc [owner:sfriquet,label:product] english-whatever-the-ui-locale
 * The returned text is sent to the Analyst agent, so it MUST be in English whatever the UI locale:
 * none of its labels may go through Lingui.
 */
export function describeAnalyticsView({
  dimension,
  filter,
  granularity,
  period,
}: AnalyticsViewInput): string {
  return [
    `Period: ${consumptionPeriodLabel(period)}`,
    `Granularity: ${consumptionGranularityLabel(granularity)}`,
    `Breakdown: ${BREAKDOWN_LABEL[dimension]}`,
    `Filters: ${describeUsageFilter(filter)}`,
  ].join("\n");
}
