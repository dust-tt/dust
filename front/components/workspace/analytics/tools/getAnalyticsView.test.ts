import type { AnalyticsViewInput } from "@app/components/workspace/analytics/analyticsView";
import { analyticsViewToolPayload } from "@app/components/workspace/analytics/tools/getAnalyticsView";
import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import { consumptionFilterSchema } from "@app/lib/api/actions/servers/workspace_analytics/query_input";
import { ConsumptionPeriodSchema } from "@app/lib/api/analytics/consumption/schema";
import { describe, expect, it } from "vitest";
import { z } from "zod";

function makeView(overrides: Partial<AnalyticsViewInput> = {}) {
  return {
    dimension: "agent",
    filter: {},
    granularity: "day",
    period: { kind: "cycle" },
    ...overrides,
  } satisfies AnalyticsViewInput;
}

const option = { name: "option", disabled: false };

const EVERY_CATEGORY: UsageFilter = {
  agent: [{ kind: "agent", id: "agt", image: null, ...option }],
  member: [{ kind: "member", id: "usr", image: null, ...option }],
  group: [{ kind: "group", id: "grp", ...option }],
  model: [{ kind: "model", id: "mdl", tier: undefined, ...option }],
  tool: [{ kind: "tool", id: "srv", icon: null, ...option }],
  skill: [{ kind: "skill", id: "skl", icon: null, ...option }],
  source: [
    { kind: "source", id: "slack", connectorProvider: "slack", ...option },
  ],
  api_key: [{ kind: "api_key", id: "key", ...option }],
};

function toolArguments(view: AnalyticsViewInput) {
  return JSON.parse(JSON.stringify(analyticsViewToolPayload(view)))
    .toolArguments;
}

describe("analyticsViewToolPayload", () => {
  it("leaves out every dimension the user does not filter on", () => {
    expect(toolArguments(makeView())).toEqual({ period: "cycle" });
  });

  it("names every filter the way the workspace analytics tools accept", () => {
    const args = toolArguments(
      makeView({ filter: EVERY_CATEGORY, period: { kind: "days", days: 90 } })
    );

    expect(args).toEqual({
      period: "days",
      days: 90,
      agentIds: ["agt"],
      userIds: ["usr"],
      groupIds: ["grp"],
      modelIds: ["mdl"],
      toolNames: ["srv"],
      skillIds: ["skl"],
      sources: ["slack"],
      apiKeyNames: ["key"],
    });
    expect(
      z
        .object(consumptionFilterSchema)
        .merge(ConsumptionPeriodSchema)
        .strict()
        .safeParse(args).success
    ).toBe(true);
  });
});
