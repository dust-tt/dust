import { fetchUserDayCells } from "@app/lib/api/activation/queries/user_day_cells";
import {
  ElasticsearchError,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchAnalytics: vi.fn() };
});

function emptyEsResponse() {
  const response: estypes.SearchResponse<never> = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    hits: { hits: [] },
    aggregations: {
      by_user_day: { buckets: [] },
    },
  };
  return new Ok(response);
}

function esResponseWithBucket({
  userId,
  dayMs,
}: {
  userId: string;
  dayMs: number;
}) {
  const response: estypes.SearchResponse<never> = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    hits: { hits: [] },
    aggregations: {
      by_user_day: {
        buckets: [
          {
            key: { user_id: userId, day: dayMs },
            doc_count: 1,
            dau: { doc_count: 1 },
            hvuc_signal: { doc_count: 1 },
          },
        ],
      },
    },
  };
  return new Ok(response);
}

describe("fetchUserDayCells", () => {
  const windowStart = new Date("2026-07-01T00:00:00.000Z");
  const windowEnd = new Date("2026-07-29T00:00:00.000Z");

  beforeEach(() => {
    vi.mocked(searchAnalytics).mockReset();
  });

  it("returns an empty map without querying Elasticsearch", async () => {
    const result = await fetchUserDayCells({
      workspaceId: "ws",
      userIds: [],
      windowStart,
      windowEnd,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.size).toBe(0);
    }
    expect(searchAnalytics).not.toHaveBeenCalled();
  });

  it("splits users above the ES cap into multiple calls and merges facts", async () => {
    // The poke cohort path previously failed with
    // "activation evaluation supports at most 100 users per call, got 239".
    const userIds = Array.from({ length: 239 }, (_, i) => `user-${i}`);
    const dayMs = Date.UTC(2026, 6, 15);

    vi.mocked(searchAnalytics)
      .mockResolvedValueOnce(esResponseWithBucket({ userId: "user-0", dayMs }))
      .mockResolvedValueOnce(
        esResponseWithBucket({ userId: "user-100", dayMs })
      )
      .mockResolvedValueOnce(
        esResponseWithBucket({ userId: "user-200", dayMs })
      );

    const result = await fetchUserDayCells({
      workspaceId: "ws",
      userIds,
      windowStart,
      windowEnd,
    });

    expect(result.isOk()).toBe(true);
    expect(searchAnalytics).toHaveBeenCalledTimes(3);
    if (result.isOk()) {
      expect(result.value.size).toBe(239);
      expect(result.value.get("user-0")).toEqual([
        { userId: "user-0", dayMs, isDau: true, isHvuc: true },
      ]);
      expect(result.value.get("user-100")).toEqual([
        { userId: "user-100", dayMs, isDau: true, isHvuc: true },
      ]);
      expect(result.value.get("user-200")).toEqual([
        { userId: "user-200", dayMs, isDau: true, isHvuc: true },
      ]);
      expect(result.value.get("user-1")).toEqual([]);
    }
  });

  it("fails the whole call when a later batch errors", async () => {
    const userIds = Array.from({ length: 101 }, (_, i) => `user-${i}`);

    vi.mocked(searchAnalytics)
      .mockResolvedValueOnce(emptyEsResponse())
      .mockResolvedValueOnce(
        new Err(new ElasticsearchError("query_error", "es unavailable"))
      );

    const result = await fetchUserDayCells({
      workspaceId: "ws",
      userIds,
      windowStart,
      windowEnd,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("es unavailable");
    }
  });
});
