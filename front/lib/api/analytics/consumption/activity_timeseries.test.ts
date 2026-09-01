import { fetchConsumptionActivityTimeseries } from "@app/lib/api/analytics/consumption/activity_timeseries";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-03T00:00:00.000Z",
};

const BUCKET_MS = 1782950400000;

function mockBuckets(buckets: unknown[]) {
  const response: estypes.SearchResponse<never> = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    hits: { hits: [] },
    aggregations: { by_date: { buckets } },
  };
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(new Ok(response));
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  return Authenticator.internalAdminForWorkspace(workspace.sId);
}

function lastOptions() {
  const calls = vi.mocked(searchConsumptionAnalytics).mock.calls;
  return calls[calls.length - 1][1];
}

describe("fetchConsumptionActivityTimeseries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts distinct messages rather than documents", async () => {
    const auth = await setup();
    mockBuckets([
      {
        key: BUCKET_MS,
        doc_count: 40,
        messages: { value: 7 },
        conversations: { value: 3 },
        activeUsers: { value: 2 },
      },
    ]);

    const result = await fetchConsumptionActivityTimeseries(auth, {
      period: PERIOD,
      granularity: "day",
      metric: "messages",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.points[0].values).toEqual({
        messages: 7,
        conversations: 3,
        activeUsers: 2,
      });
    }
  });

  it("counts tool executions from the tool documents only", async () => {
    const auth = await setup();
    mockBuckets([
      {
        key: BUCKET_MS,
        doc_count: 40,
        executions: { doc_count: 12, activeUsers: { value: 4 } },
      },
    ]);

    const result = await fetchConsumptionActivityTimeseries(auth, {
      period: PERIOD,
      granularity: "day",
      metric: "tools",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.points[0].values).toEqual({
        executions: 12,
        activeUsers: 4,
      });
    }
  });

  it("counts one skill execution per attributed skill, not per document", async () => {
    const auth = await setup();
    mockBuckets([
      {
        key: BUCKET_MS,
        doc_count: 40,
        // One tool call attributed to two skills: one document, two executions.
        executions: {
          doc_count: 1,
          count: { value: 2 },
          activeUsers: { value: 1 },
        },
      },
    ]);

    const result = await fetchConsumptionActivityTimeseries(auth, {
      period: PERIOD,
      granularity: "day",
      metric: "skills",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.points[0].values).toEqual({
        executions: 2,
        activeUsers: 1,
      });
    }
  });

  it("counts a skill execution only where a skill is attributed", async () => {
    const auth = await setup();
    mockBuckets([]);

    await fetchConsumptionActivityTimeseries(auth, {
      period: PERIOD,
      granularity: "day",
      metric: "skills",
    });

    expect(
      lastOptions()?.aggregations?.by_date?.aggs?.executions?.filter
    ).toMatchObject({
      bool: {
        filter: [
          { term: { consumption_type: "tool" } },
          { exists: { field: "tool.attributed_skill_ids" } },
        ],
      },
    });
  });

  it("buckets in the caller's timezone", async () => {
    const auth = await setup();
    mockBuckets([]);

    await fetchConsumptionActivityTimeseries(auth, {
      period: PERIOD,
      granularity: "day",
      metric: "messages",
      timezone: "Europe/Paris",
    });

    expect(lastOptions()?.aggregations?.by_date?.date_histogram).toMatchObject({
      time_zone: "Europe/Paris",
    });
  });
});
