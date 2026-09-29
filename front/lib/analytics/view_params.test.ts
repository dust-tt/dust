import { CONSUMPTION_DIMENSIONS } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  CONSUMPTION_GRANULARITY_OPTIONS,
  CONSUMPTION_PERIOD_OPTIONS,
  DEFAULT_CONSUMPTION_GRANULARITY,
} from "@app/lib/analytics/consumption_period";
import type { AnalyticsViewState } from "@app/lib/analytics/view_params";
import {
  analyticsConsumptionHref,
  DEFAULT_ANALYTICS_VIEW_STATE,
  readAnalyticsView,
  serializeAnalyticsView,
} from "@app/lib/analytics/view_params";
import {
  CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION,
  CONSUMPTION_SCOPE_DIMENSIONS,
} from "@app/types/api/analytics/consumption";
import { describe, expect, it } from "vitest";

const WORKSPACE_ID = "0ec9852c2f";

function encode(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString("base64url");
}

function decode(value: string | undefined): string {
  return Buffer.from(value ?? "", "base64url").toString();
}

const VIEW_CASES: [json: string, state: AnalyticsViewState][] = [
  ["", DEFAULT_ANALYTICS_VIEW_STATE],
  [
    '{"filter":{"agent":{"8oGtWFRlPa":"Support"}}}',
    {
      period: { kind: "cycle" },
      granularity: DEFAULT_CONSUMPTION_GRANULARITY,
      dimension: "agent",
      filter: { agent: { "8oGtWFRlPa": "Support" } },
    },
  ],
  [
    '{"period":30,"tab":"model","filter":{"agent":{"8oGtWFRlPa":"Support"},"source":{"slack":"Slack"}}}',
    {
      period: { kind: "days", days: 30 },
      granularity: DEFAULT_CONSUMPTION_GRANULARITY,
      dimension: "model",
      filter: {
        agent: { "8oGtWFRlPa": "Support" },
        source: { slack: "Slack" },
      },
    },
  ],
];

describe("analytics view hash", () => {
  it.each(VIEW_CASES)("writes %s", (json, state) => {
    expect(decode(serializeAnalyticsView(state))).toBe(json);
  });

  it.each(VIEW_CASES)("reads %s", (_json, state) => {
    expect(readAnalyticsView(serializeAnalyticsView(state))).toEqual(state);
  });

  it("spends nothing on a field that is already on its default", () => {
    expect(
      decode(
        serializeAnalyticsView({
          ...DEFAULT_ANALYTICS_VIEW_STATE,
          filter: { model: {}, source: { slack: "Slack" } },
        })
      )
    ).toBe('{"filter":{"source":{"slack":"Slack"}}}');
  });
});

describe("every axis of the view survives the round trip", () => {
  it.each(CONSUMPTION_PERIOD_OPTIONS)("period %o", (period) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, period };

    expect(readAnalyticsView(serializeAnalyticsView(view))).toEqual(view);
  });

  it.each(CONSUMPTION_GRANULARITY_OPTIONS)("granularity %s", (granularity) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, granularity };

    expect(readAnalyticsView(serializeAnalyticsView(view))).toEqual(view);
  });

  it.each(CONSUMPTION_DIMENSIONS)("dimension %s", (dimension) => {
    const view = { ...DEFAULT_ANALYTICS_VIEW_STATE, dimension };

    expect(readAnalyticsView(serializeAnalyticsView(view))).toEqual(view);
  });

  it.each(CONSUMPTION_SCOPE_DIMENSIONS)("filter %s", (dimension) => {
    const view = {
      ...DEFAULT_ANALYTICS_VIEW_STATE,
      filter: {
        [dimension]: { "id-1": "One", "id 2": "Two", "a&b=c": "Café & co" },
      },
    };

    expect(readAnalyticsView(serializeAnalyticsView(view))).toEqual(view);
  });
});

describe("readAnalyticsView", () => {
  it("renders the default view for anything it cannot read", () => {
    expect(readAnalyticsView(undefined)).toEqual(DEFAULT_ANALYTICS_VIEW_STATE);
    expect(readAnalyticsView("not base64!")).toEqual(
      DEFAULT_ANALYTICS_VIEW_STATE
    );
    expect(
      readAnalyticsView(
        encode({
          period: 45,
          granularity: "never",
          tab: "nope",
          filter: { agent: { "": "Empty" } },
        })
      )
    ).toEqual(DEFAULT_ANALYTICS_VIEW_STATE);
    expect(readAnalyticsView(encode({ period: "30" })).period).toEqual({
      kind: "cycle",
    });
  });

  it("caps a category at what the API accepts", () => {
    const agents = Object.fromEntries(
      Array.from({ length: 900 }, (_, index) => [`agent-${index}`, "Agent"])
    );

    expect(
      Object.keys(
        readAnalyticsView(encode({ filter: { agent: agents } })).filter.agent ??
          {}
      )
    ).toHaveLength(CONSUMPTION_FILTER_MAX_VALUES_PER_DIMENSION);
  });
});

describe("analyticsConsumptionHref", () => {
  it("omits the hash for the default view", () => {
    expect(analyticsConsumptionHref(WORKSPACE_ID)).toBe(
      `/w/${WORKSPACE_ID}/analytics/consumption`
    );
  });

  it("builds a link other pages can hand to the router", () => {
    const href = analyticsConsumptionHref(WORKSPACE_ID, {
      period: { kind: "days", days: 30 },
      dimension: "model",
      filter: { agent: { "8oGtWFRlPa": "Support" } },
    });
    const url = new URL(href, "https://dust.tt");

    expect(url.pathname).toBe(`/w/${WORKSPACE_ID}/analytics/consumption`);
    expect(url.search).toBe("");
    expect(
      readAnalyticsView(
        new URLSearchParams(url.hash.slice(2)).get("search") ?? undefined
      )
    ).toEqual({
      period: { kind: "days", days: 30 },
      granularity: DEFAULT_CONSUMPTION_GRANULARITY,
      dimension: "model",
      filter: { agent: { "8oGtWFRlPa": "Support" } },
    });
  });
});
