import {
  contextOriginFilter,
  fetchContextOriginBreakdown,
} from "@app/lib/api/assistant/observability/context_origin";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

function esResponse(
  buckets: {
    key: string;
    doc_count: number;
    unique_messages: { value: number };
  }[]
) {
  const response: estypes.SearchResponse<never> = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    hits: { hits: [] },
    aggregations: {
      by_origin: { buckets },
    },
  };

  return new Ok(response);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contextOriginFilter", () => {
  it("returns no clause for undefined / empty array / empty string", () => {
    expect(contextOriginFilter(undefined)).toEqual([]);
    expect(contextOriginFilter([])).toEqual([]);
    expect(contextOriginFilter("")).toEqual([]);
  });

  it("emits a term query for a single known origin", () => {
    expect(contextOriginFilter("slack")).toEqual([
      { term: { context_origin: "slack" } },
    ]);
  });

  it("emits a terms query for multiple known origins", () => {
    expect(contextOriginFilter(["slack", "web"])).toEqual([
      { terms: { context_origin: ["slack", "web"] } },
    ]);
  });

  it("matches the literal value OR a missing field for the unknown sentinel", () => {
    expect(contextOriginFilter("unknown")).toEqual([
      {
        bool: {
          should: [
            { term: { context_origin: "unknown" } },
            { bool: { must_not: { exists: { field: "context_origin" } } } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });

  it("matches all values literally and ORs the missing-field clause when unknown is included", () => {
    expect(contextOriginFilter(["slack", "unknown"])).toEqual([
      {
        bool: {
          should: [
            { terms: { context_origin: ["slack", "unknown"] } },
            { bool: { must_not: { exists: { field: "context_origin" } } } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });

  it("drops empty values before building clauses", () => {
    expect(contextOriginFilter(["slack", ""])).toEqual([
      { term: { context_origin: "slack" } },
    ]);
  });
});

describe("fetchContextOriginBreakdown", () => {
  it("counts distinct messages in a consumption-index scope", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse([
        {
          key: "web",
          doc_count: 5,
          unique_messages: { value: 2 },
        },
        {
          key: "slack",
          doc_count: 3,
          unique_messages: { value: 1 },
        },
      ])
    );

    const result = await fetchContextOriginBreakdown(authenticator, {
      period: {
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-09-01T00:00:00.000Z",
      },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      { origin: "web", count: 2 },
      { origin: "slack", count: 1 },
    ]);

    const [query, options] = vi.mocked(searchConsumptionAnalytics).mock
      .calls[0];
    expect(query.bool?.filter).toEqual([
      {
        term: {
          workspace_id: authenticator.getNonNullableWorkspace().sId,
        },
      },
      {
        range: {
          completed_at: {
            gte: "2026-08-01T00:00:00.000Z",
            lt: "2026-09-01T00:00:00.000Z",
          },
        },
      },
    ]);
    expect(options).toMatchObject({
      size: 0,
      aggregations: {
        by_origin: {
          terms: {
            field: "normalized_origin",
            size: 20,
            missing: "unknown",
          },
          aggs: {
            unique_messages: {
              cardinality: {
                field: "agent_message_id",
                precision_threshold: 40_000,
              },
            },
          },
        },
      },
    });
  });
});
