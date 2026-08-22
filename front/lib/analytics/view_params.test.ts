import { CONSUMPTION_DIMENSIONS } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { USAGE_FILTER_CATEGORIES } from "@app/components/workspace/analytics/usageFilter";
import { CONSUMPTION_PERIOD_OPTIONS } from "@app/lib/analytics/consumption_period";
import type { AnalyticsViewState } from "@app/lib/analytics/view_params";
import {
  analyticsConsumptionHref,
  analyticsViewQuery,
  analyticsViewQueryString,
  DEFAULT_ANALYTICS_VIEW_STATE,
  readAnalyticsView,
} from "@app/lib/analytics/view_params";
import { CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION } from "@app/lib/api/analytics/consumption/scope";
import { describe, expect, it } from "vitest";

const WORKSPACE_ID = "0ec9852c2f";

function roundTripped(view: AnalyticsViewState): AnalyticsViewState {
  const query = analyticsViewQueryString(analyticsViewQuery(view));
  const readBack: Record<string, string[]> = {};
  for (const [name, value] of new URLSearchParams(query)) {
    readBack[name] = [...(readBack[name] ?? []), value];
  }
  return readAnalyticsView(readBack);
}

// Query strings captured from shipped builds. Changing what one reads as is
// allowed, but only by editing the expected state here, in a visible diff.
const GOLDEN: [query: string, state: AnalyticsViewState][] = [
  ["", DEFAULT_ANALYTICS_VIEW_STATE],
  [
    "agents=8oGtWFRlPa",
    {
      period: { kind: "cycle" },
      dimension: "agent",
      filter: { agent: ["8oGtWFRlPa"] },
    },
  ],
  [
    "period=30&dimension=model&agents=8oGtWFRlPa&sources=slack",
    {
      period: { kind: "days", days: 30 },
      dimension: "model",
      filter: { agent: ["8oGtWFRlPa"], source: ["slack"] },
    },
  ],
  [
    "api_keys=Zapier+prod+*main*",
    {
      period: { kind: "cycle" },
      dimension: "agent",
      filter: { api_key: ["Zapier prod *main*"] },
    },
  ],
];

describe("analytics view params", () => {
  it.each(GOLDEN)("writes %s", (query, state) => {
    expect(analyticsViewQueryString(analyticsViewQuery(state))).toBe(query);
  });

  it.each(GOLDEN)("reads %s", (query, state) => {
    expect(roundTripped(state)).toEqual(state);
  });

  it("spends nothing on a field that is already on its default", () => {
    expect(
      analyticsViewQueryString(
        analyticsViewQuery({
          ...DEFAULT_ANALYTICS_VIEW_STATE,
          filter: { model: [], source: ["slack"] },
        })
      )
    ).toBe("sources=slack");
  });

  it("clears the params a field no longer needs", () => {
    expect(
      analyticsViewQuery({
        ...DEFAULT_ANALYTICS_VIEW_STATE,
        filter: { source: ["slack"] },
      })
    ).toEqual({
      period: undefined,
      dimension: undefined,
      agents: undefined,
      users: undefined,
      groups: undefined,
      models: undefined,
      tools: undefined,
      skills: undefined,
      sources: ["slack"],
      api_keys: undefined,
    });
  });
});

describe("every axis of the view survives the round trip", () => {
  it.each(CONSUMPTION_PERIOD_OPTIONS)("period %o", (period) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, period };

    expect(roundTripped(view)).toEqual(view);
  });

  it.each(CONSUMPTION_DIMENSIONS)("dimension %s", (dimension) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, dimension };

    expect(roundTripped(view)).toEqual(view);
  });

  it.each(USAGE_FILTER_CATEGORIES)("category %s", (category) => {
    const view = {
      ...DEFAULT_ANALYTICS_VIEW_STATE,
      filter: { [category]: ["id-1", "id 2", "a&b=c"] },
    };

    expect(roundTripped(view)).toEqual(view);
  });
});

describe("readAnalyticsView", () => {
  it("renders the default view for anything it cannot read", () => {
    expect(readAnalyticsView({})).toEqual(DEFAULT_ANALYTICS_VIEW_STATE);
    expect(
      readAnalyticsView({ period: "45", dimension: "nope", agents: "" })
    ).toEqual(DEFAULT_ANALYTICS_VIEW_STATE);
    expect(readAnalyticsView({ period: ["30", "7"] }).period).toEqual({
      kind: "days",
      days: 30,
    });
  });

  it("ignores a param it does not own", () => {
    expect(readAnalyticsView({ tab: "explore", v: "1pd30" })).toEqual(
      DEFAULT_ANALYTICS_VIEW_STATE
    );
  });

  it("caps a category at what the API accepts", () => {
    const agents = Array.from({ length: 900 }, (_, index) => `agent-${index}`);

    expect(readAnalyticsView({ agents }).filter.agent).toHaveLength(
      CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION
    );
  });
});

describe("analyticsConsumptionHref", () => {
  it("omits the query string for the default view", () => {
    expect(analyticsConsumptionHref(WORKSPACE_ID)).toBe(
      `/w/${WORKSPACE_ID}/analytics/consumption`
    );
  });

  it("builds a link other pages can hand to the router", () => {
    expect(
      analyticsConsumptionHref(WORKSPACE_ID, {
        period: { kind: "days", days: 30 },
        dimension: "model",
        filter: { agent: ["8oGtWFRlPa"] },
      })
    ).toBe(
      `/w/${WORKSPACE_ID}/analytics/consumption?period=30&dimension=model&agents=8oGtWFRlPa`
    );
  });

  it("leaves escaping to the serializer", () => {
    const href = analyticsConsumptionHref(WORKSPACE_ID, {
      filter: { api_key: ["Zapier prod *main*", "a&b"] },
    });
    const url = new URL(href, "https://dust.tt");

    expect(url.searchParams.getAll("api_keys")).toEqual([
      "Zapier prod *main*",
      "a&b",
    ]);
  });
});
