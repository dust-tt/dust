import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchAnalytics: vi.fn() };
});

interface UserDayBucket {
  key: { day: number; user: string };
  doc_count: number;
}

function esResponse(
  buckets: UserDayBucket[],
  afterKey?: { day: number; user: string }
) {
  const response: estypes.SearchResponse<never> = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    hits: { hits: [] },
    aggregations: {
      by_user_day: {
        buckets,
        ...(afterKey ? { after_key: afterKey } : {}),
      },
    },
  };

  return new Ok(response);
}

describe("fetchActiveUsersMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("combines paginated user-day buckets before computing active users", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const firstDay = Date.UTC(2026, 7, 6);
    const secondDay = Date.UTC(2026, 7, 7);

    vi.mocked(searchAnalytics)
      .mockResolvedValueOnce(
        esResponse(
          [
            { key: { day: firstDay, user: "user-1" }, doc_count: 1 },
            { key: { day: secondDay, user: "user-1" }, doc_count: 1 },
          ],
          { day: secondDay, user: "user-1" }
        )
      )
      .mockResolvedValueOnce(
        esResponse([{ key: { day: secondDay, user: "user-2" }, doc_count: 1 }])
      );

    const result = await fetchActiveUsersMetrics(
      workspace,
      "2026-08-06",
      "2026-08-07"
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(
        result.value.map(({ date, dau, wau, mau }) => ({
          date,
          dau,
          wau,
          mau,
        }))
      ).toEqual([
        { date: "2026-08-06", dau: 1, wau: 1, mau: 1 },
        { date: "2026-08-07", dau: 2, wau: 2, mau: 2 },
      ]);
    }
    expect(searchAnalytics).toHaveBeenCalledTimes(2);
  });
});
