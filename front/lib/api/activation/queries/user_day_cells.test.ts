import { fetchUserDayCells } from "@app/lib/api/activation/queries/user_day_cells";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
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
    vi.mocked(searchConsumptionAnalytics).mockReset();
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
    expect(searchConsumptionAnalytics).not.toHaveBeenCalled();
  });

  it("queries completed consumption by user and day", async () => {
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(emptyEsResponse());

    await fetchUserDayCells({
      workspaceId: "ws",
      userIds: ["user-1"],
      windowStart,
      windowEnd,
    });

    expect(searchConsumptionAnalytics).toHaveBeenCalledWith(
      {
        bool: {
          filter: [
            { term: { workspace_id: "ws" } },
            { terms: { "user.id": ["user-1"] } },
            { terms: { context_origin: USER_USAGE_ORIGINS } },
            {
              range: {
                completed_at: {
                  gte: windowStart.toISOString(),
                  lt: windowEnd.toISOString(),
                },
              },
            },
          ],
        },
      },
      {
        size: 0,
        aggregations: {
          by_user_day: {
            composite: {
              size: 3100,
              sources: [
                { user_id: { terms: { field: "user.id" } } },
                {
                  day: {
                    date_histogram: {
                      field: "completed_at",
                      calendar_interval: "1d",
                      time_zone: "UTC",
                    },
                  },
                },
              ],
            },
            aggregations: {
              dau: {
                filter: {
                  bool: {
                    filter: [
                      { term: { consumption_type: "llm" } },
                      {
                        terms: {
                          context_origin: USER_USAGE_ORIGINS.filter(
                            (origin) => origin !== "triggered"
                          ),
                        },
                      },
                      { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
                    ],
                  },
                },
              },
              hvuc_signal: {
                filter: {
                  bool: {
                    filter: [
                      { term: { consumption_type: "tool" } },
                      { term: { status: "succeeded" } },
                    ],
                    should: [
                      {
                        range: {
                          "gross_credit_micro.direct": { gte: 3_000_000 },
                        },
                      },
                      {
                        term: {
                          "tool.server_name": "interactive_content",
                        },
                      },
                      { term: { "tool.server_name": "run_agent" } },
                    ],
                    minimum_should_match: 1,
                  },
                },
              },
            },
          },
        },
      }
    );
  });

  it("splits users above the ES cap into multiple calls and merges facts", async () => {
    // The poke cohort path previously failed with
    // "activation evaluation supports at most 100 users per call, got 239".
    const userIds = Array.from({ length: 239 }, (_, i) => `user-${i}`);
    const dayMs = Date.UTC(2026, 6, 15);

    vi.mocked(searchConsumptionAnalytics)
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
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(3);
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

    vi.mocked(searchConsumptionAnalytics)
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
