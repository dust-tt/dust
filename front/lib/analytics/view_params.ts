import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  consumptionDimensionFromQueryParam,
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
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import type { ConsumptionScopeDimension } from "@app/types/api/analytics/consumption";
import {
  CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/types/api/analytics/consumption";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type AnalyticsViewState = {
  period: ConsumptionPeriodSelection;
  granularity: ConsumptionGranularity;
  dimension: ConsumptionDimension;
  filter: Partial<Record<ConsumptionScopeDimension, string[]>>;
};

export const DEFAULT_ANALYTICS_VIEW_STATE: AnalyticsViewState = {
  period: DEFAULT_CONSUMPTION_PERIOD,
  granularity: DEFAULT_CONSUMPTION_GRANULARITY,
  dimension: DEFAULT_CONSUMPTION_DIMENSION,
  filter: {},
};

export const MAX_ANALYTICS_URL_LENGTH = 2_048;

const PERIOD_PARAM = "p";

const GRANULARITY_PARAM = "gr";

const DIMENSION_PARAM = "d";

const CATEGORY_PARAM = {
  agent: "a",
  user: "u",
  group: "g",
  model: "m",
  tool: "t",
  skill: "sk",
  source: "s",
  api_key: "k",
} as const satisfies Record<ConsumptionScopeDimension, string>;

export const ANALYTICS_VIEW_PARAMS: readonly string[] = [
  PERIOD_PARAM,
  GRANULARITY_PARAM,
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

function granularityParam(
  granularity: ConsumptionGranularity
): string | undefined {
  return granularity === DEFAULT_CONSUMPTION_GRANULARITY
    ? undefined
    : granularity;
}

function readGranularity(
  value: string | string[] | undefined
): ConsumptionGranularity {
  const [first] = readValues(value);
  return (
    consumptionGranularityFromKey(first ?? "") ??
    DEFAULT_CONSUMPTION_GRANULARITY
  );
}

/**
 * Best effort: a value this build does not know falls back to the default for
 * its field, and a filter longer than the API accepts is cut to fit, so a
 * hand-written URL degrades instead of breaking the page.
 */
export function readAnalyticsView(query: AnalyticsQuery): AnalyticsViewState {
  const filter: AnalyticsViewState["filter"] = {};
  for (const dimension of CONSUMPTION_SCOPE_DIMENSIONS) {
    const ids = readValues(query[CATEGORY_PARAM[dimension]]).slice(
      0,
      CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION
    );
    if (ids.length > 0) {
      filter[dimension] = ids;
    }
  }

  // Spelled out rather than spread over the default, so a field added to the
  // view state has to be read here before this compiles.
  return {
    period: readPeriod(query[PERIOD_PARAM]),
    granularity: readGranularity(query[GRANULARITY_PARAM]),
    dimension: consumptionDimensionFromQueryParam(
      readValues(query[DIMENSION_PARAM])[0]
    ),
    filter,
  };
}

function filterQuery(filter: AnalyticsViewState["filter"]): AnalyticsQuery {
  const query: AnalyticsQuery = {};
  for (const dimension of CONSUMPTION_SCOPE_DIMENSIONS) {
    query[CATEGORY_PARAM[dimension]] = filter[dimension]?.length
      ? filter[dimension]
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
    granularity: { [GRANULARITY_PARAM]: granularityParam(view.granularity) },
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
    granularity: input.granularity ?? DEFAULT_ANALYTICS_VIEW_STATE.granularity,
    dimension: input.dimension ?? DEFAULT_ANALYTICS_VIEW_STATE.dimension,
    filter: input.filter ?? {},
  };
  const path = `/w/${workspaceId}/analytics/consumption`;
  const query = analyticsViewUrlQuery(path, {}, view);

  return urlWithQuery(path, query);
}

export function premiumModelUsageAnalyticsHref(
  workspaceId: string,
  userId: string
): string {
  const premiumModelIds = [
    ...new Set(
      getSupportedModelConfigs()
        .filter(
          (model) =>
            !isModelStreamId(model.modelId) &&
            getTierForModel(model.modelId, model.defaultReasoningEffort) ===
              "premium"
        )
        .map((model) => model.modelId)
    ),
  ];

  return analyticsConsumptionHref(workspaceId, {
    period: { kind: "days", days: 7 },
    filter: {
      user: [userId],
      model: premiumModelIds,
    },
  });
}
