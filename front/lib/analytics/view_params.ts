import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  consumptionDimensionFromQueryParam,
  DEFAULT_CONSUMPTION_DIMENSION,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { UsageFilterCategory } from "@app/components/workspace/analytics/usageFilter";
import { USAGE_FILTER_CATEGORIES } from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  CONSUMPTION_PERIOD_DAY_OPTIONS,
  DEFAULT_CONSUMPTION_PERIOD,
} from "@app/lib/analytics/consumption_period";
import { CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION } from "@app/lib/api/analytics/consumption/scope";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type AnalyticsViewState = {
  period: ConsumptionPeriodSelection;
  dimension: ConsumptionDimension;
  filter: Partial<Record<UsageFilterCategory, string[]>>;
};

export const DEFAULT_ANALYTICS_VIEW_STATE: AnalyticsViewState = {
  period: DEFAULT_CONSUMPTION_PERIOD,
  dimension: DEFAULT_CONSUMPTION_DIMENSION,
  filter: {},
};

export const MAX_ANALYTICS_URL_LENGTH = 2_048;

const PERIOD_PARAM = "p";

const DIMENSION_PARAM = "d";

const CATEGORY_PARAM = {
  agent: "a",
  member: "u",
  group: "g",
  model: "m",
  tool: "t",
  skill: "sk",
  source: "s",
  api_key: "k",
} as const satisfies Record<UsageFilterCategory, string>;

export const ANALYTICS_VIEW_PARAMS: readonly string[] = [
  PERIOD_PARAM,
  DIMENSION_PARAM,
  ...Object.values(CATEGORY_PARAM),
];

export type AnalyticsQuery = Record<string, string | string[] | undefined>;

function readValues(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).filter(
    (single) => single.length > 0
  );
}

function periodParam(period: ConsumptionPeriodSelection): string | undefined {
  switch (period.kind) {
    case "cycle":
      return undefined;
    case "days":
      return String(period.days);
    default:
      return assertNever(period);
  }
}

function readPeriod(
  value: string | string[] | undefined
): ConsumptionPeriodSelection {
  const [first] = readValues(value);
  const days = CONSUMPTION_PERIOD_DAY_OPTIONS.find(
    (option) => option === Number(first)
  );
  return days ? { kind: "days", days } : DEFAULT_CONSUMPTION_PERIOD;
}

/**
 * Best effort: a value this build does not know falls back to the default for
 * its field, and a filter longer than the API accepts is cut to fit, so a
 * hand-written URL degrades instead of breaking the page.
 */
export function readAnalyticsView(query: AnalyticsQuery): AnalyticsViewState {
  const filter: AnalyticsViewState["filter"] = {};
  for (const category of USAGE_FILTER_CATEGORIES) {
    const ids = readValues(query[CATEGORY_PARAM[category]]).slice(
      0,
      CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION
    );
    if (ids.length > 0) {
      filter[category] = ids;
    }
  }

  // Spelled out rather than spread over the default, so a field added to the
  // view state has to be read here before this compiles.
  return {
    period: readPeriod(query[PERIOD_PARAM]),
    dimension: consumptionDimensionFromQueryParam(
      readValues(query[DIMENSION_PARAM])[0]
    ),
    filter,
  };
}

function filterQuery(filter: AnalyticsViewState["filter"]): AnalyticsQuery {
  const query: AnalyticsQuery = {};
  for (const category of USAGE_FILTER_CATEGORIES) {
    query[CATEGORY_PARAM[category]] = filter[category]?.length
      ? filter[category]
      : undefined;
  }
  return query;
}

/**
 * Every param the view owns, on `undefined` when the field is on its default,
 * so merging this over the current query both writes and clears.
 */
export function analyticsViewQuery(view: AnalyticsViewState): AnalyticsQuery {
  // Keyed on the view state so a field added to it has no home in the URL
  // until someone gives it one.
  const fields = {
    period: { [PERIOD_PARAM]: periodParam(view.period) },
    dimension: {
      [DIMENSION_PARAM]:
        view.dimension === DEFAULT_CONSUMPTION_DIMENSION
          ? undefined
          : view.dimension,
    },
    filter: filterQuery(view.filter),
  } satisfies Record<keyof AnalyticsViewState, AnalyticsQuery>;

  return Object.values(fields).reduce((all, part) => ({ ...all, ...part }), {});
}

// Serializes only the params the view owns, so the page can tell whether the
// URL already says what the state says.
export function analyticsViewQueryString(query: AnalyticsQuery): string {
  return queryString(query, ANALYTICS_VIEW_PARAMS);
}

function queryString(query: AnalyticsQuery, names: readonly string[]): string {
  const params = new URLSearchParams();
  for (const name of names) {
    for (const value of readValues(query[name])) {
      params.append(name, value);
    }
  }
  return params.toString();
}

function urlWithQuery(pathname: string, query: AnalyticsQuery): string {
  const querySuffix = queryString(query, Object.keys(query));
  return querySuffix ? `${pathname}?${querySuffix}` : pathname;
}

/**
 * Rebuilds the URL from the query params the page does not own (`head`) and
 * the complete analytics view (`tail`).
 */
export function analyticsViewUrlQuery(
  pathname: string,
  head: AnalyticsQuery,
  view: AnalyticsViewState
): AnalyticsQuery {
  const tail = analyticsViewQuery(view);
  const candidate = { ...head, ...tail };

  if (urlWithQuery(pathname, candidate).length > MAX_ANALYTICS_URL_LENGTH) {
    return {};
  }

  return candidate;
}

export function analyticsConsumptionHref(
  workspaceId: string,
  input: Partial<AnalyticsViewState> = {}
): string {
  const view: AnalyticsViewState = {
    period: input.period ?? DEFAULT_ANALYTICS_VIEW_STATE.period,
    dimension: input.dimension ?? DEFAULT_ANALYTICS_VIEW_STATE.dimension,
    filter: input.filter ?? {},
  };
  const path = `/w/${workspaceId}/analytics/consumption`;
  const query = analyticsViewUrlQuery(path, {}, view);

  return urlWithQuery(path, query);
}
