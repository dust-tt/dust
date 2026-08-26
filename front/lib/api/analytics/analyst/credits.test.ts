import { fetchAnalystCreditUsage } from "@app/lib/api/analytics/analyst/credits";
import { buildAnalystScope } from "@app/lib/api/analytics/analyst/scope";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

// A real, fully-populated SearchResponse — only `aggregations` varies per
// test — so callers never need an `as` cast to satisfy
// `searchConsumptionAnalytics`'s return type.
function esResponse(
  aggregations: unknown
): Awaited<ReturnType<typeof searchConsumptionAnalytics>> {
  return new Ok({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: 0, relation: "eq" }, hits: [] },
    aggregations,
  });
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const scope = buildAnalystScope({
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
    timezone: "UTC",
  });
  return { auth, scope };
}

describe("fetchAnalystCreditUsage", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(resolveDimensionLabels).mockReset();
  });

  it("groupBy 'none' requests only the total, no by_group aggregation", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({ metric: { value: 5_000_000 } })
    );

    const result = await fetchAnalystCreditUsage({
      auth,
      scope,
      groupBy: "none",
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual({ totalCredits: 5, rows: [] });

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations).toEqual({
      metric: { sum: { field: "credit_micro" } },
    });
  });

  it("groupBy 'agent' ranks within a filter sub-agg on agent.attributed_id", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        metric: { value: 10_000_000 },
        by_group: {
          ranked: {
            buckets: [
              { key: "a1", doc_count: 3, metric: { value: 4_000_000 } },
            ],
          },
        },
      })
    );
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        ["a1", { name: "Agent One", pictureUrl: null, description: null }],
      ])
    );

    const result = await fetchAnalystCreditUsage({
      auth,
      scope,
      groupBy: "agent",
      limit: 5,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    // The root total, not the sum of the ranked buckets — the whole point of
    // wrapping the ranking in a `filter` sub-agg instead of the root query.
    expect(result.value.totalCredits).toBe(10);
    expect(result.value.rows).toEqual([
      { groupKey: "a1", name: "Agent One", totalCredits: 4 },
    ]);

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations).toEqual({
      metric: { sum: { field: "credit_micro" } },
      by_group: {
        filter: { exists: { field: "agent.attributed_id" } },
        aggs: {
          ranked: {
            terms: {
              field: "agent.attributed_id",
              size: 5,
              order: { metric: "desc" },
            },
            aggs: { metric: { sum: { field: "credit_micro" } } },
          },
        },
      },
    });
  });

  it("falls back to the raw key when a group's label does not resolve", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        metric: { value: 1_000_000 },
        by_group: {
          ranked: {
            buckets: [
              {
                key: "deleted-model",
                doc_count: 1,
                metric: { value: 1_000_000 },
              },
            ],
          },
        },
      })
    );
    vi.mocked(resolveDimensionLabels).mockResolvedValue(new Map());

    const result = await fetchAnalystCreditUsage({
      auth,
      scope,
      groupBy: "model",
      limit: 5,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.rows).toEqual([
      { groupKey: "deleted-model", name: "deleted-model", totalCredits: 1 },
    ]);
  });

  it("rounds micro-credits to whole credits", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({ metric: { value: 1_500_000 } })
    );

    const result = await fetchAnalystCreditUsage({
      auth,
      scope,
      groupBy: "none",
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.totalCredits).toBe(2);
  });

  it("propagates an Elasticsearch error", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );

    const result = await fetchAnalystCreditUsage({
      auth,
      scope,
      groupBy: "none",
      limit: 10,
    });

    expect(result.isErr()).toBe(true);
  });
});
