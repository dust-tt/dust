import {
  buildAgentAnalyticsBaseQuery,
  daysToInstantRange,
} from "@app/lib/api/assistant/observability/utils";
import moment from "moment-timezone";
import { describe, expect, it } from "vitest";

describe("buildAgentAnalyticsBaseQuery", () => {
  it("keeps the single-agent path unchanged (sidekick shape)", () => {
    expect(
      buildAgentAnalyticsBaseQuery({
        workspaceId: "w1",
        agentId: "a1",
        days: 30,
      })
    ).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: "w1" } },
          { term: { agent_id: "a1" } },
          { range: { timestamp: { gte: "now-30d/d" } } },
        ],
      },
    });
  });

  it("adds agentIds / userIds / contextOrigin filters when provided", () => {
    expect(
      buildAgentAnalyticsBaseQuery({
        workspaceId: "w1",
        agentIds: ["a1", "a2"],
        userIds: ["u1"],
        contextOrigin: "slack",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      })
    ).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: "w1" } },
          { terms: { agent_id: ["a1", "a2"] } },
          { term: { user_id: "u1" } },
          { term: { context_origin: "slack" } },
          { range: { timestamp: { gte: "2026-01-01", lte: "2026-01-31" } } },
        ],
      },
    });
  });

  it("omits empty array filters", () => {
    expect(
      buildAgentAnalyticsBaseQuery({
        workspaceId: "w1",
        agentIds: [],
        userIds: [],
      })
    ).toEqual({ bool: { filter: [{ term: { workspace_id: "w1" } }] } });
  });

  it("rejects passing both agentId and agentIds at compile time", () => {
    // @ts-expect-error agentId and agentIds are mutually exclusive
    buildAgentAnalyticsBaseQuery({
      workspaceId: "w1",
      agentId: "a1",
      agentIds: ["a2"],
    });
  });
});

describe("daysToInstantRange", () => {
  it("spans N calendar days ending now, anchored at start-of-day in the tz", () => {
    const timezone = "America/New_York";
    const { startDate, endDate } = daysToInstantRange(30, timezone);

    const start = moment.tz(startDate, timezone);
    const end = moment.tz(endDate, timezone);

    expect(start.format("HH:mm:ss.SSS")).toBe("00:00:00.000");
    expect(end.startOf("day").diff(start, "days")).toBe(29);
  });

  it("includes the whole current day (end is now, not start-of-day)", () => {
    const { endDate } = daysToInstantRange(7, "UTC");
    expect(moment.utc(endDate).diff(moment.utc(), "minutes")).toBeGreaterThan(
      -2
    );
  });
});
