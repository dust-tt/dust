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

const EVERY_CATEGORY: UsageFilter = {
  agent: [
    { kind: "agent", id: "agt", name: "Dust", disabled: false, image: null },
  ],
  member: [
    { kind: "member", id: "usr", name: "Ada", disabled: false, image: null },
  ],
  group: [{ kind: "group", id: "grp", name: "Eng", disabled: false }],
  model: [
    {
      kind: "model",
      id: "claude-sonnet-4-5",
      name: "Sonnet",
      disabled: false,
      tier: undefined,
    },
  ],
  tool: [
    { kind: "tool", id: "srv", name: "Search", disabled: false, icon: null },
  ],
  skill: [
    { kind: "skill", id: "skl", name: "Frames", disabled: false, icon: null },
  ],
  source: [
    {
      kind: "source",
      id: "slack",
      name: "Slack",
      disabled: false,
      connectorProvider: "slack",
    },
  ],
  api_key: [{ kind: "api_key", id: "key", name: "CI", disabled: false }],
};

function serialized(view: AnalyticsViewInput) {
  return JSON.parse(JSON.stringify(analyticsViewToolPayload(view)));
}

describe("analyticsViewToolPayload", () => {
  it("omits days for the billing cycle", () => {
    expect(serialized(makeView()).toolArguments).toEqual({ period: "cycle" });
  });

  it("carries days for a relative period", () => {
    expect(
      serialized(makeView({ period: { kind: "days", days: 30 } })).toolArguments
    ).toEqual({ period: "days", days: 30 });
  });

  it("names every filter dimension the way the analytics tools do", () => {
    expect(
      serialized(makeView({ filter: EVERY_CATEGORY })).toolArguments
    ).toEqual({
      period: "cycle",
      agentIds: ["agt"],
      userIds: ["usr"],
      groupIds: ["grp"],
      modelIds: ["claude-sonnet-4-5"],
      toolNames: ["srv"],
      skillIds: ["skl"],
      sources: ["slack"],
      apiKeyNames: ["key"],
    });
  });

  it("reports granularity and dimension outside the tool arguments", () => {
    const payload = serialized(
      makeView({ dimension: "tool", granularity: "week" })
    );

    expect(payload.granularity).toBe("week");
    expect(payload.dimension).toBe("tool");
    expect(payload.toolArguments).not.toHaveProperty("granularity");
    expect(payload.toolArguments).not.toHaveProperty("dimension");
  });

  it("produces arguments the workspace analytics tools accept", () => {
    const schema = z
      .object(consumptionFilterSchema)
      .merge(ConsumptionPeriodSchema)
      .strict();

    for (const view of [
      makeView(),
      makeView({ filter: EVERY_CATEGORY, period: { kind: "days", days: 90 } }),
    ]) {
      expect(schema.safeParse(serialized(view).toolArguments).success).toBe(
        true
      );
    }
  });
});
