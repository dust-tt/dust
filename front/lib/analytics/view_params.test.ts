import { CONSUMPTION_DIMENSIONS } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  CONSUMPTION_GRANULARITY_OPTIONS,
  CONSUMPTION_PERIOD_OPTIONS,
  DEFAULT_CONSUMPTION_GRANULARITY,
} from "@app/lib/analytics/consumption_period";
import type { AnalyticsViewState } from "@app/lib/analytics/view_params";
import {
  analyticsConsumptionHref,
  analyticsViewQuery,
  analyticsViewQueryString,
  analyticsViewUrlQuery,
  DEFAULT_ANALYTICS_VIEW_STATE,
  MAX_ANALYTICS_URL_LENGTH,
  premiumModelUsageAnalyticsHref,
  readAnalyticsView,
} from "@app/lib/analytics/view_params";
import {
  CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/types/api/analytics/consumption";
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

const VIEW_CASES: [query: string, state: AnalyticsViewState][] = [
  ["", DEFAULT_ANALYTICS_VIEW_STATE],
  [
    "a=8oGtWFRlPa",
    {
      period: { kind: "cycle" },
      granularity: DEFAULT_CONSUMPTION_GRANULARITY,
      dimension: "agent",
      filter: { agent: ["8oGtWFRlPa"] },
    },
  ],
  [
    "p=30&d=model&a=8oGtWFRlPa&s=slack",
    {
      period: { kind: "days", days: 30 },
      granularity: DEFAULT_CONSUMPTION_GRANULARITY,
      dimension: "model",
      filter: { agent: ["8oGtWFRlPa"], source: ["slack"] },
    },
  ],
  [
    "k=Zapier+prod+*main*",
    {
      period: { kind: "cycle" },
      granularity: DEFAULT_CONSUMPTION_GRANULARITY,
      dimension: "agent",
      filter: { api_key: ["Zapier prod *main*"] },
    },
  ],
];

describe("analytics view params", () => {
  it.each(VIEW_CASES)("writes %s", (query, state) => {
    expect(analyticsViewQueryString(analyticsViewQuery(state))).toBe(query);
  });

  it.each(VIEW_CASES)("reads %s", (query, state) => {
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
    ).toBe("s=slack");
  });

  it("clears the params a field no longer needs", () => {
    expect(
      analyticsViewQuery({
        ...DEFAULT_ANALYTICS_VIEW_STATE,
        filter: { source: ["slack"] },
      })
    ).toEqual({
      p: undefined,
      gr: undefined,
      d: undefined,
      a: undefined,
      u: undefined,
      g: undefined,
      m: undefined,
      t: undefined,
      sk: undefined,
      s: ["slack"],
      k: undefined,
    });
  });
});

describe("every axis of the view survives the round trip", () => {
  it.each(CONSUMPTION_PERIOD_OPTIONS)("period %o", (period) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, period };

    expect(roundTripped(view)).toEqual(view);
  });

  it.each(CONSUMPTION_GRANULARITY_OPTIONS)("granularity %s", (granularity) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, granularity };

    expect(roundTripped(view)).toEqual(view);
  });

  it.each(CONSUMPTION_DIMENSIONS)("dimension %s", (dimension) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, dimension };

    expect(roundTripped(view)).toEqual(view);
  });

  it.each(CONSUMPTION_SCOPE_DIMENSIONS)("dimension %s", (dimension) => {
    const view = {
      ...DEFAULT_ANALYTICS_VIEW_STATE,
      filter: { [dimension]: ["id-1", "id 2", "a&b=c"] },
    };

    expect(roundTripped(view)).toEqual(view);
  });
});

describe("readAnalyticsView", () => {
  it("renders the default view for anything it cannot read", () => {
    expect(readAnalyticsView({})).toEqual(DEFAULT_ANALYTICS_VIEW_STATE);
    expect(readAnalyticsView({ p: "45", d: "nope", a: "" })).toEqual(
      DEFAULT_ANALYTICS_VIEW_STATE
    );
    expect(readAnalyticsView({ p: ["30", "7"] }).period).toEqual({
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

    expect(readAnalyticsView({ a: agents }).filter.agent).toHaveLength(
      CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION
    );
  });
});

describe("analyticsViewUrlQuery", () => {
  it("rebuilds the query from the unowned head and complete view tail", () => {
    expect(
      analyticsViewUrlQuery(
        `/w/${WORKSPACE_ID}/analytics/consumption`,
        { tab: "explore", a: "old-agent" },
        {
          ...DEFAULT_ANALYTICS_VIEW_STATE,
          dimension: "model",
          filter: { source: ["slack"] },
        }
      )
    ).toEqual({
      tab: "explore",
      p: undefined,
      gr: undefined,
      d: "model",
      a: undefined,
      u: undefined,
      g: undefined,
      m: undefined,
      t: undefined,
      sk: undefined,
      s: ["slack"],
      k: undefined,
    });
  });

  it("drops the whole query when the URL would be too long", () => {
    const query = analyticsViewUrlQuery(
      `/w/${WORKSPACE_ID}/analytics/consumption`,
      { tab: "explore", a: "old-agent" },
      {
        ...DEFAULT_ANALYTICS_VIEW_STATE,
        filter: { source: ["x".repeat(MAX_ANALYTICS_URL_LENGTH)] },
      }
    );

    expect(query).toEqual({});
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
      `/w/${WORKSPACE_ID}/analytics/consumption?p=30&d=model&a=8oGtWFRlPa`
    );
  });

  it("leaves escaping to the serializer", () => {
    const href = analyticsConsumptionHref(WORKSPACE_ID, {
      filter: { api_key: ["Zapier prod *main*", "a&b"] },
    });
    const url = new URL(href, "https://dust.tt");

    expect(url.searchParams.getAll("k")).toEqual(["Zapier prod *main*", "a&b"]);
  });

  it("omits the query string when the URL would be too long", () => {
    expect(
      analyticsConsumptionHref(WORKSPACE_ID, {
        filter: { source: ["x".repeat(MAX_ANALYTICS_URL_LENGTH)] },
      })
    ).toBe(`/w/${WORKSPACE_ID}/analytics/consumption`);
  });
});

describe("premiumModelUsageAnalyticsHref", () => {
  it("links to the user's Premium model usage for the limit window", () => {
    const href = premiumModelUsageAnalyticsHref(WORKSPACE_ID, "user-1");
    const url = new URL(href, "https://dust.tt");

    expect(url.pathname).toBe(`/w/${WORKSPACE_ID}/analytics/consumption`);
    expect(url.searchParams.get("p")).toBe("7");
    expect(url.searchParams.getAll("u")).toEqual(["user-1"]);
    expect(url.searchParams.getAll("m").length).toBeGreaterThan(0);
    expect(url.searchParams.getAll("m")).not.toContain("auto_complex");
  });
});
