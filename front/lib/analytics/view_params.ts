import type { FilterHashSelection } from "@app/components/shared/filter_panel/filterHash";
import {
  FILTER_HASH_PARAM,
  parseFilterHash,
  serializeFilterHash,
} from "@app/components/shared/filter_panel/filterHash";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  CONSUMPTION_DIMENSIONS,
  DEFAULT_CONSUMPTION_DIMENSION,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  CONSUMPTION_PERIOD_DAY_OPTIONS,
  consumptionGranularityFromKey,
  DEFAULT_CONSUMPTION_GRANULARITY,
  DEFAULT_CONSUMPTION_PERIOD,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeDimension } from "@app/types/api/analytics/consumption";
import {
  CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/types/api/analytics/consumption";
import { isString } from "@app/types/shared/utils/general";

export type AnalyticsViewState = {
  period: ConsumptionPeriodSelection;
  granularity: ConsumptionGranularity;
  dimension: ConsumptionDimension;
  filter: FilterHashSelection<ConsumptionScopeDimension>;
};

export const DEFAULT_ANALYTICS_VIEW_STATE: AnalyticsViewState = {
  period: DEFAULT_CONSUMPTION_PERIOD,
  granularity: DEFAULT_CONSUMPTION_GRANULARITY,
  dimension: DEFAULT_CONSUMPTION_DIMENSION,
  filter: {},
};

function periodField(period: ConsumptionPeriodSelection): number | undefined {
  switch (period.kind) {
    case "cycle":
      return undefined;
    case "days":
      return period.days;
  }
}

function readPeriod(value: unknown): ConsumptionPeriodSelection {
  const days = CONSUMPTION_PERIOD_DAY_OPTIONS.find(
    (option) => option === value
  );
  return days ? { kind: "days", days } : DEFAULT_CONSUMPTION_PERIOD;
}

function readGranularity(value: unknown): ConsumptionGranularity {
  return (
    (isString(value) ? consumptionGranularityFromKey(value) : null) ??
    DEFAULT_CONSUMPTION_GRANULARITY
  );
}

/**
 * Best effort: a value this build does not know falls back to the default for
 * its field, and a filter longer than the API accepts is cut to fit, so a
 * hand-written URL degrades instead of breaking the page.
 */
export function readAnalyticsView(
  value: string | undefined
): AnalyticsViewState {
  const { tabId, selection, fields } = parseFilterHash(value, {
    categories: CONSUMPTION_SCOPE_DIMENSIONS,
    tabIds: CONSUMPTION_DIMENSIONS,
    defaultTabId: DEFAULT_CONSUMPTION_DIMENSION,
    maxIdsPerCategory: CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION,
  });

  // Spelled out rather than spread over the default, so a field added to the
  // view state has to be read here before this compiles.
  return {
    period: readPeriod(fields.period),
    granularity: readGranularity(fields.granularity),
    dimension: tabId,
    filter: selection,
  };
}

// The breakdown dimension is the page's tab; fields on their default are omitted.
export function serializeAnalyticsView({
  period,
  granularity,
  dimension,
  filter,
}: AnalyticsViewState): string | undefined {
  return serializeFilterHash(
    { tabId: dimension, selection: filter },
    DEFAULT_CONSUMPTION_DIMENSION,
    {
      period: periodField(period),
      granularity:
        granularity === DEFAULT_CONSUMPTION_GRANULARITY
          ? undefined
          : granularity,
    }
  );
}

export function analyticsConsumptionHref(
  workspaceId: string,
  input: Partial<AnalyticsViewState> = {}
): string {
  const view: AnalyticsViewState = {
    period: input.period ?? DEFAULT_ANALYTICS_VIEW_STATE.period,
    granularity: input.granularity ?? DEFAULT_ANALYTICS_VIEW_STATE.granularity,
    dimension: input.dimension ?? DEFAULT_ANALYTICS_VIEW_STATE.dimension,
    filter: input.filter ?? {},
  };
  const path = `/w/${workspaceId}/analytics/consumption`;
  const value = serializeAnalyticsView(view);

  return value
    ? `${path}#?${new URLSearchParams({ [FILTER_HASH_PARAM]: value })}`
    : path;
}
