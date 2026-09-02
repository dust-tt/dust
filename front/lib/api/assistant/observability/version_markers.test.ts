import { fetchVersionMarkers } from "@app/lib/api/assistant/observability/version_markers";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

function mockVersionBuckets(
  buckets: { key: string; doc_count: number; first_seen: { value: number } }[]
) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" as const }, hits: [] },
      aggregations: {
        by_version: { buckets },
      },
    })
  );
}

describe("fetchVersionMarkers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns version markers sorted by timestamp", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    mockVersionBuckets([
      { key: "3", doc_count: 5, first_seen: { value: 3000 } },
      { key: "1", doc_count: 10, first_seen: { value: 1000 } },
      { key: "2", doc_count: 3, first_seen: { value: 2000 } },
    ]);

    const result = await fetchVersionMarkers({
      auth: authenticator,
      agentId: "agent-abc",
      days: 30,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toEqual([
      { version: "1", timestamp: 1000 },
      { version: "2", timestamp: 2000 },
      { version: "3", timestamp: 3000 },
    ]);
  });

  it("returns an empty array when no versions exist", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    mockVersionBuckets([]);

    const result = await fetchVersionMarkers({
      auth: authenticator,
      agentId: "agent-abc",
      days: 7,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([]);
  });

  it("passes the agent filter and aggregation to searchConsumptionAnalytics", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    mockVersionBuckets([]);

    await fetchVersionMarkers({
      auth: authenticator,
      agentId: "agent-xyz",
      days: 14,
    });

    expect(searchConsumptionAnalytics).toHaveBeenCalledOnce();

    expect(searchConsumptionAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        bool: expect.objectContaining({
          filter: expect.arrayContaining([
            expect.objectContaining({
              term: { "agent.attributed_id": "agent-xyz" },
            }),
          ]),
        }),
      }),
      expect.objectContaining({
        size: 0,
        aggregations: expect.objectContaining({
          by_version: expect.anything(),
        }),
      })
    );
  });

  it("defaults timestamp to 0 when first_seen is missing", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" as const }, hits: [] },
        aggregations: {
          by_version: {
            buckets: [{ key: "1", doc_count: 1 }],
          },
        },
      })
    );

    const result = await fetchVersionMarkers({
      auth: authenticator,
      agentId: "agent-abc",
      days: 7,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([{ version: "1", timestamp: 0 }]);
  });
});
