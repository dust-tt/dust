import { resolveDimensionDisplayNames } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_FIELDS } from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTimeseries,
  OTHERS_GROUP_KEY,
  TOTAL_GROUP_KEY,
} from "@app/lib/api/analytics/consumption/timeseries";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionDisplayNames: vi.fn() };
});

const PERIOD_START_MS = Date.UTC(2026, 6, 1);
const PERIOD_END_MS = Date.UTC(2026, 7, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

// Jul 1 through Jul 4, 08:00 on Jul 3 being "now": Jul 3 is in progress and
// Jul 4 has not happened yet.
const NOW_MS = Date.UTC(2026, 6, 3, 8);

const PERIOD: ConsumptionPeriod = {
  startDate: new Date(PERIOD_START_MS).toISOString(),
  endDate: new Date(PERIOD_END_MS).toISOString(),
};

function dayBucket(
  dayIndex: number,
  microCredits: number,
  activeUsers: number = 0
) {
  return {
    key: PERIOD_START_MS + dayIndex * DAY_MS,
    active_users: { value: activeUsers },
    metric: { value: microCredits },
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

function mockGroupNames(names: Record<string, string>) {
  vi.mocked(resolveDimensionDisplayNames).mockResolvedValue(
    new Map(Object.entries(names))
  );
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth, period: PERIOD, workspace };
}

describe("fetchConsumptionTimeseries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(resolveDimensionDisplayNames).mockReset();
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("sums gross credits by default and converts micro-credits", async () => {
    const { auth, period } = await setup();
    mockBuckets([dayBucket(0, 2_000_000), dayBucket(1, 1_500_000)]);

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "period",
    });

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations?.by_date?.aggs?.metric).toEqual({
      sum: { field: "credit_micro" },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.metric).toBe("credit_micro");
    expect(
      result.value.points.map((point) => point.values[TOTAL_GROUP_KEY])
    ).toEqual([2, 1.5]);
    expect(result.value.groups).toEqual([
      { groupKey: TOTAL_GROUP_KEY, name: "Total" },
    ]);
  });

  it("buckets the whole period, including the part still to come", async () => {
    const { auth, period } = await setup();
    mockBuckets([dayBucket(0, 1_000_000)]);

    await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "period",
    });

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations?.by_date?.date_histogram).toMatchObject({
      field: "completed_at",
      calendar_interval: "day",
      time_zone: "UTC",
      min_doc_count: 0,
      // The period is half-open, so the last instant covered is one ms short of
      // its end — an inclusive bound would open an empty extra bucket.
      extended_bounds: { min: PERIOD_START_MS, max: PERIOD_END_MS - 1 },
    });
  });

  it("counts active users in each consumption bucket", async () => {
    const { auth, period } = await setup();
    mockBuckets([dayBucket(0, 2_000_000, 4), dayBucket(1, 1_500_000, 2)]);

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "period",
    });

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations?.by_date?.aggs?.active_users).toEqual({
      cardinality: {
        field: "user.id",
        precision_threshold: 40_000,
      },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.points.map((point) => point.activeUsers)).toEqual([
      4, 2,
    ]);
  });

  it("returns the workspace member count independently of scope filters", async () => {
    const { auth, period, workspace } = await setup();
    const firstMember = await UserFactory.basic();
    await MembershipFactory.associate(workspace, firstMember, { role: "user" });
    const secondMember = await UserFactory.basic();
    await MembershipFactory.associate(workspace, secondMember, {
      role: "manager",
    });
    mockBuckets([]);

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "period",
      filter: { agents: ["agent-id"] },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.workspaceMemberCount).toBe(2);
  });

  it("omits the workspace member count without workspace context", async () => {
    const { auth, period, workspace } = await setup();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    mockBuckets([]);

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "period",
      includeWorkspaceContext: false,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.workspaceMemberCount).toBeNull();
  });

  it("omits the workspace member count for non-managers", async () => {
    const { period, workspace } = await setup();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      member.sId,
      workspace.sId
    );
    mockBuckets([]);

    const result = await fetchConsumptionTimeseries(memberAuth, {
      period,
      granularity: "day",
      mode: "period",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.workspaceMemberCount).toBeNull();
  });

  it("zeroes buckets that have not started yet", async () => {
    const { auth, period } = await setup();
    mockBuckets([
      dayBucket(0, 2_000_000, 2),
      dayBucket(2, 500_000, 1), // Today, still filling.
      // A future bucket carrying a value: clock skew, or a document indexed
      // ahead of time. Either way it has not happened.
      dayBucket(3, 9_000_000, 9),
    ]);

    const result = await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "period",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(
      result.value.points.map((point) => point.values[TOTAL_GROUP_KEY])
    ).toEqual([2, 0.5, 0]);
    expect(result.value.points.map((point) => point.activeUsers)).toEqual([
      2, 1, 0,
    ]);
  });

  it("scopes the query to the requested dimension filters", async () => {
    const { auth, period } = await setup();
    mockBuckets([]);

    await fetchConsumptionTimeseries(auth, {
      period,
      granularity: "day",
      mode: "period",
      filter: { agents: ["a1"], sources: ["web", "slack"], skills: ["s1"] },
    });

    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query.bool?.filter).toEqual(
      expect.arrayContaining([
        { term: { "agent.attributed_id": "a1" } },
        { term: { "tool.attributed_skill_ids": "s1" } },
        { terms: { normalized_origin: ["web", "slack"] } },
      ])
    );
  });

  it("stops the cumulative total at today rather than plateauing", async () => {
    const { auth, period } = await setup();
    mockBuckets([
      dayBucket(0, 2_000_000, 2),
      dayBucket(1, 1_500_000, 3),
      dayBucket(2, 500_000, 1), // Today, still filling.
      dayBucket(3, 0, 5), // Not happened yet.
      dayBucket(4, 0, 5),
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
    // The axis still runs the length of the period; the running total does not.
    expect(
      result.value.points.map((point) => point.values[TOTAL_GROUP_KEY])
    ).toEqual([2, 3.5, 4, 0, 0]);
    // Active users remain a per-bucket count even when credits accumulate.
    expect(result.value.points.map((point) => point.activeUsers)).toEqual([
      2, 3, 1, 0, 0,
    ]);
  });

  describe("breakdown", () => {
    function groupDayBucket(
      dayIndex: number,
      totalMicroCredits: number,
      perGroupMicroCredits: Record<string, number>
    ) {
      return {
        ...dayBucket(dayIndex, totalMicroCredits),
        by_group: {
          buckets: Object.entries(perGroupMicroCredits).map(([key, value]) => ({
            key,
            metric: { value },
          })),
        },
      };
    }

    it.each([
      "agent",
      "user",
      "api_key",
      "group",
      "model",
      "tool",
      "skill",
      "source",
    ] as ConsumptionScopeDimension[])("ranks %s on its index field and restricts the histogram to the top N", async (dimension) => {
      const { auth, period } = await setup();
      mockGroupNames({ k1: "First" });
      mockBreakdown({ rankedKeys: ["k1"], buckets: [] });

      await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "period",
        breakdownBy: dimension,
        breakdownCount: 10,
      });

      const field = CONSUMPTION_DIMENSION_FIELDS[dimension];

      const [, rankingOptions] = vi.mocked(searchConsumptionAnalytics).mock
        .calls[0];
      expect(rankingOptions?.aggregations?.by_group?.terms).toMatchObject({
        field,
        size: 10,
        order: { metric: "desc" },
      });

      const [, histogramOptions] = vi.mocked(searchConsumptionAnalytics).mock
        .calls[1];
      expect(
        histogramOptions?.aggregations?.by_date?.aggs?.by_group?.terms
      ).toMatchObject({ field, include: ["k1"] });

      expect(vi.mocked(resolveDimensionDisplayNames)).toHaveBeenCalledWith(
        auth,
        dimension,
        ["k1"]
      );
    });

    it("returns one series per ranked group, named and in rank order", async () => {
      const { auth, period } = await setup();
      mockGroupNames({ agent1: "@dust", agent2: "@deep-dive" });
      mockBreakdown({
        rankedKeys: ["agent1", "agent2"],
        buckets: [
          groupDayBucket(0, 3_000_000, {
            agent1: 2_000_000,
            agent2: 1_000_000,
          }),
          groupDayBucket(1, 1_000_000, { agent1: 1_000_000 }),
        ],
      });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "period",
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
      // A group absent from a bucket still gets a 0, so the stack is complete.
      expect(result.value.points[1].values).toEqual({ agent1: 1, agent2: 0 });
    });

    it("folds consumption beyond the top N into an others series", async () => {
      const { auth, period } = await setup();
      mockGroupNames({ user1: "Alice" });
      mockBreakdown({
        rankedKeys: ["user1"],
        // Bucket total exceeds the ranked user: the remainder is other users.
        buckets: [groupDayBucket(0, 5_000_000, { user1: 2_000_000 })],
      });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "period",
        breakdownBy: "user",
        breakdownCount: 1,
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.groups).toEqual([
        { groupKey: "user1", name: "Alice" },
        { groupKey: OTHERS_GROUP_KEY, name: "Others" },
      ]);
      expect(result.value.points[0].values).toEqual({
        user1: 2,
        [OTHERS_GROUP_KEY]: 3,
      });
    });

    it("keeps others at zero when a multi-valued dimension double-counts", async () => {
      const { auth, period } = await setup();
      mockGroupNames({ skill1: "Research", skill2: "Summarize" });
      // One tool call attributed to both skills: each group carries the full
      // bucket total, so the ranked sum overshoots it.
      mockBreakdown({
        rankedKeys: ["skill1", "skill2"],
        buckets: [
          groupDayBucket(0, 2_000_000, {
            skill1: 2_000_000,
            skill2: 2_000_000,
          }),
        ],
      });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "period",
        breakdownBy: "skill",
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.groups.map((group) => group.groupKey)).toEqual([
        "skill1",
        "skill2",
      ]);
      expect(result.value.points[0].values).toEqual({ skill1: 2, skill2: 2 });
    });

    it("falls back to a total series when nothing was consumed", async () => {
      const { auth, period } = await setup();
      mockBreakdown({ rankedKeys: [], buckets: [dayBucket(0, 0)] });

      const result = await fetchConsumptionTimeseries(auth, {
        period,
        granularity: "day",
        mode: "period",
        breakdownBy: "model",
      });

      expect(result.isOk()).toBe(true);
      if (!result.isOk()) {
        return;
      }
      expect(result.value.groups).toEqual([
        { groupKey: TOTAL_GROUP_KEY, name: "Total" },
      ]);
      expect(vi.mocked(resolveDimensionDisplayNames)).not.toHaveBeenCalled();
    });

    it("accumulates each series independently in cumulative mode", async () => {
      const { auth, period } = await setup();
      mockGroupNames({ agent1: "@dust", agent2: "@deep-dive" });
      mockBreakdown({
        rankedKeys: ["agent1", "agent2"],
        buckets: [
          groupDayBucket(0, 3_000_000, {
            agent1: 2_000_000,
            agent2: 1_000_000,
          }),
          groupDayBucket(1, 1_000_000, { agent1: 1_000_000 }),
          groupDayBucket(2, 2_000_000, { agent2: 2_000_000 }),
          groupDayBucket(3, 0, {}),
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
      // Each agent accumulates on its own, and every series drops to 0 for the
      // buckets that have not started — no series plateaus.
      expect(result.value.points.map((point) => point.values)).toEqual([
        { agent1: 2, agent2: 1 },
        { agent1: 3, agent2: 1 },
        { agent1: 3, agent2: 3 },
        { agent1: 0, agent2: 0 },
      ]);
    });
  });
});
