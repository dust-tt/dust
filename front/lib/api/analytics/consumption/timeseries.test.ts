import { buildConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  OTHERS_GROUP_KEY,
  TOTAL_GROUP_KEY,
} from "@app/lib/api/analytics/consumption/series";
import { fetchConsumptionTimeseries } from "@app/lib/api/analytics/consumption/timeseries";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    searchConsumptionAnalytics: vi.fn(),
  };
});

vi.mock(
  import("@app/lib/api/assistant/observability/agent_labels"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, resolveAnalyticsAgentLabels: vi.fn() };
  }
);

const CYCLE_START_MS = Date.UTC(2026, 6, 1);
const CYCLE_END_MS = Date.UTC(2026, 7, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

// Jul 1 through Jul 4, 08:00 on Jul 3 being "now": Jul 3 is in progress and
// Jul 4 has not happened yet.
const NOW_MS = Date.UTC(2026, 6, 3, 8);

function dayBucket(dayIndex: number, creditMicro: number) {
  return {
    key: CYCLE_START_MS + dayIndex * DAY_MS,
    credit_micro: { value: creditMicro },
  };
}

// The helper is generic over the agg shape; the tests only supply the
// aggregation branch the fetcher reads.
function esResponse(aggregations: unknown) {
  return new Ok({ aggregations }) as Awaited<
    ReturnType<typeof searchConsumptionAnalytics>
  >;
}

function mockBuckets(buckets: unknown[]) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    esResponse({ by_date: { buckets } })
  );
}

// A breakdown runs two searches: the ranking first, then the histogram.
function mockBreakdown({
  rankedKeys,
  buckets,
}: {
  rankedKeys: string[];
  buckets: unknown[];
}) {
  vi.mocked(searchConsumptionAnalytics)
    .mockResolvedValueOnce(
      esResponse({
        by_group: { buckets: rankedKeys.map((key) => ({ key })) },
      })
    )
    .mockResolvedValueOnce(esResponse({ by_date: { buckets } }));
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const period = buildConsumptionPeriod({
    kind: "cycle",
    cycleStartMs: CYCLE_START_MS,
    cycleEndMs: CYCLE_END_MS,
    nowMs: NOW_MS,
  });
  return { auth, period };
}

describe("fetchConsumptionTimeseries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(resolveAnalyticsAgentLabels).mockReset();
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("converts micro-credits and flags the bucket in progress", async () => {
    const { auth, period } = await setup();
    mockBuckets([
      dayBucket(0, 2_000_000),
      dayBucket(1, 1_500_000),
      dayBucket(2, 500_000), // Today, still filling.
      dayBucket(3, 0), // Not happened yet.
    ]);

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "daily",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.points).toEqual([
      {
        timestamp: dayBucket(0, 0).key,
        values: { total: 2 },
        isPartial: false,
      },
      {
        timestamp: dayBucket(1, 0).key,
        values: { total: 1.5 },
        isPartial: false,
      },
      {
        timestamp: dayBucket(2, 0).key,
        values: { total: 0.5 },
        isPartial: true,
      },
      {
        timestamp: dayBucket(3, 0).key,
        values: { total: 0 },
        isPartial: false,
      },
    ]);
    expect(result.value.groups).toEqual([
      { groupKey: TOTAL_GROUP_KEY, name: "Total" },
    ]);
  });

  it("requests buckets through the end of the cycle, not through now", async () => {
    const { auth, period } = await setup();
    mockBuckets([dayBucket(0, 1_000_000)]);

    await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "daily",
    });

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations?.by_date?.date_histogram).toMatchObject({
      field: "completed_at",
      calendar_interval: "day",
      time_zone: "UTC",
      min_doc_count: 0,
      extended_bounds: { min: CYCLE_START_MS, max: CYCLE_END_MS },
    });
  });

  it("accumulates up to the bucket in progress and drops future buckets", async () => {
    const { auth, period } = await setup();
    mockBuckets([
      dayBucket(0, 2_000_000),
      dayBucket(1, 1_500_000),
      dayBucket(2, 500_000),
      dayBucket(3, 0),
    ]);

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "cumulative",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(
      result.value.points.map((point) => point.values[TOTAL_GROUP_KEY])
    ).toEqual([2, 3.5, 4]);
  });

  it("marks no bucket partial once the cycle is over", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const endedPeriod = buildConsumptionPeriod({
      kind: "cycle",
      cycleStartMs: Date.UTC(2026, 5, 1),
      cycleEndMs: Date.UTC(2026, 6, 1),
      nowMs: NOW_MS,
    });
    mockBuckets([dayBucket(0, 1_000_000), dayBucket(1, 1_000_000)]);

    const result = await fetchConsumptionTimeseries(auth, {
      period: endedPeriod,
      granularity: "day",
      mode: "daily",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.points.every((point) => !point.isPartial)).toBe(true);
  });

  describe("agent breakdown", () => {
    function mockAgentNames(names: Record<string, string>) {
      vi.mocked(resolveAnalyticsAgentLabels).mockResolvedValue(
        new Map(
          Object.entries(names).map(([agentId, name]) => [
            agentId,
            {
              name,
              pictureUrl: null,
              modelDisplayName: "Claude",
              description: "",
            },
          ])
        )
      );
    }

    function agentDayBucket(
      dayIndex: number,
      totalMicro: number,
      perAgentMicro: Record<string, number>
    ) {
      return {
        ...dayBucket(dayIndex, totalMicro),
        by_group: {
          buckets: Object.entries(perAgentMicro).map(([key, value]) => ({
            key,
            credit_micro: { value },
          })),
        },
      };
    }

    it("returns one series per ranked agent, named and in rank order", async () => {
      const { auth, period } = await setup();
      mockAgentNames({ agent1: "@dust", agent2: "@deep-dive" });
      mockBreakdown({
        rankedKeys: ["agent1", "agent2"],
        buckets: [
          agentDayBucket(0, 3_000_000, {
            agent1: 2_000_000,
            agent2: 1_000_000,
          }),
          agentDayBucket(1, 1_000_000, { agent1: 1_000_000 }),
        ],
      });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "daily",
        breakdownBy: "agent",
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.breakdownBy).toBe("agent");
      expect(result.value.groups).toEqual([
        { groupKey: "agent1", name: "@dust" },
        { groupKey: "agent2", name: "@deep-dive" },
      ]);
      // An agent absent from a bucket still gets a 0, so the stack is complete.
      expect(result.value.points[1].values).toEqual({ agent1: 1, agent2: 0 });
    });

    it("folds consumption beyond the top N into an others series", async () => {
      const { auth, period } = await setup();
      mockAgentNames({ agent1: "@dust" });
      mockBreakdown({
        rankedKeys: ["agent1"],
        // Bucket total exceeds the ranked agent: the remainder is other agents.
        buckets: [agentDayBucket(0, 5_000_000, { agent1: 2_000_000 })],
      });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "daily",
        breakdownBy: "agent",
        breakdownCount: 1,
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.groups).toEqual([
        { groupKey: "agent1", name: "@dust" },
        { groupKey: OTHERS_GROUP_KEY, name: "Others" },
      ]);
      expect(result.value.points[0].values).toEqual({
        agent1: 2,
        [OTHERS_GROUP_KEY]: 3,
      });
    });

    it("ranks on the requested field and restricts the histogram to the top N", async () => {
      const { auth, period } = await setup();
      mockAgentNames({ agent1: "@dust" });
      mockBreakdown({ rankedKeys: ["agent1"], buckets: [] });

      await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "daily",
        breakdownBy: "agent",
        breakdownCount: 10,
      });

      const [, rankingOptions] = vi.mocked(searchConsumptionAnalytics).mock
        .calls[0];
      expect(rankingOptions?.aggregations?.by_group?.terms).toMatchObject({
        field: "agent.id",
        size: 10,
        order: { credit_micro: "desc" },
      });

      const [, histogramOptions] = vi.mocked(searchConsumptionAnalytics).mock
        .calls[1];
      expect(
        histogramOptions?.aggregations?.by_date?.aggs?.by_group?.terms
      ).toMatchObject({ field: "agent.id", include: ["agent1"] });
    });

    it("falls back to a total series when nothing was consumed", async () => {
      const { auth, period } = await setup();
      mockBreakdown({ rankedKeys: [], buckets: [dayBucket(0, 0)] });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "daily",
        breakdownBy: "agent",
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.groups).toEqual([
        { groupKey: TOTAL_GROUP_KEY, name: "Total" },
      ]);
      expect(vi.mocked(resolveAnalyticsAgentLabels)).not.toHaveBeenCalled();
    });

    it("accumulates each series independently in cumulative mode", async () => {
      const { auth, period } = await setup();
      mockAgentNames({ agent1: "@dust", agent2: "@deep-dive" });
      mockBreakdown({
        rankedKeys: ["agent1", "agent2"],
        buckets: [
          agentDayBucket(0, 3_000_000, {
            agent1: 2_000_000,
            agent2: 1_000_000,
          }),
          agentDayBucket(1, 1_000_000, { agent1: 1_000_000 }),
          agentDayBucket(2, 2_000_000, { agent2: 2_000_000 }),
          agentDayBucket(3, 0, {}),
        ],
      });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "cumulative",
        breakdownBy: "agent",
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      // Future bucket dropped; each agent accumulates on its own.
      expect(result.value.points.map((point) => point.values)).toEqual([
        { agent1: 2, agent2: 1 },
        { agent1: 3, agent2: 1 },
        { agent1: 3, agent2: 3 },
      ]);
    });
  });
});
