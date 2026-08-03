import { fetchPodUsageBreakdown } from "@app/lib/api/assistant/observability/pod_usage";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep the DB and resources real; only stub the Elasticsearch boundary.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchAnalytics: vi.fn() };
});

function stubEsBuckets(
  buckets: { key: string; doc_count: number }[],
  sumOtherDocCount: number = 0
) {
  const response: estypes.SearchResponse<never> = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0, skipped: 0 },
    hits: { hits: [] },
    aggregations: {
      by_space: { buckets, sum_other_doc_count: sumOtherDocCount },
    },
  };
  vi.mocked(searchAnalytics).mockResolvedValue(new Ok(response));
}

describe("fetchPodUsageBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("labels project spaces and merges everything else into the null bucket", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace);
    const regularSpace = await SpaceFactory.regular(workspace);

    stubEsBuckets([
      { key: pod.sId, doc_count: 12 },
      { key: regularSpace.sId, doc_count: 3 },
      { key: "vlt_doesnotexist", doc_count: 2 },
      { key: "__none__", doc_count: 5 },
    ]);

    const result = await fetchPodUsageBreakdown(auth, {
      bool: { filter: [] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        buckets: [
          { podId: pod.sId, name: pod.name, count: 12 },
          { podId: null, name: null, count: 10 },
        ],
        otherPodsCount: 0,
      });
    }
  });

  it("surfaces the aggregation's truncated-tail count as otherPodsCount", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });

    const pod = await SpaceFactory.project(workspace);

    stubEsBuckets([{ key: pod.sId, doc_count: 12 }], 805);

    const result = await fetchPodUsageBreakdown(auth, {
      bool: { filter: [] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.otherPodsCount).toBe(805);
      expect(result.value.buckets).toEqual([
        { podId: pod.sId, name: pod.name, count: 12 },
      ]);
    }
  });

  it("returns pod buckets sorted by count descending", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });

    const podA = await SpaceFactory.project(workspace);
    const podB = await SpaceFactory.project(workspace);

    stubEsBuckets([
      { key: podA.sId, doc_count: 2 },
      { key: podB.sId, doc_count: 7 },
    ]);

    const result = await fetchPodUsageBreakdown(auth, {
      bool: { filter: [] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.buckets.map((b) => b.podId)).toEqual([
        podB.sId,
        podA.sId,
      ]);
    }
  });

  it("returns an empty array when there are no messages", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "admin",
    });

    stubEsBuckets([]);

    const result = await fetchPodUsageBreakdown(auth, {
      bool: { filter: [] },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ buckets: [], otherPodsCount: 0 });
    }
  });
});
