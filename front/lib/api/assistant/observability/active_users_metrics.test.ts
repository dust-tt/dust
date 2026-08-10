import { fetchActiveUsersMetrics } from "@app/lib/api/assistant/observability/active_users_metrics";
import {
  ElasticsearchError,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchAnalytics: vi.fn() };
});

describe("fetchActiveUsersMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes Elasticsearch error details", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const elasticsearchError = new ElasticsearchError(
      "query_error",
      "Trying to create too many buckets",
      400
    );

    vi.mocked(searchAnalytics).mockResolvedValueOnce(
      new Err(elasticsearchError)
    );

    const result = await fetchActiveUsersMetrics(
      workspace,
      "2026-08-06",
      "2026-08-07"
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "Elasticsearch query failed (query_error, HTTP 400): Trying to create too many buckets"
      );
      expect(result.error.cause).toBe(elasticsearchError);
    }
  });
});
