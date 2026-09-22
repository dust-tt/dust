import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...original,
    searchConsumptionAnalytics: search,
  };
});

import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { fetchDiscoveryTrendingCandidates } from "@app/lib/search_usage/trending";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";

function bucket(
  resourceId: string,
  currentUsers: number,
  previousUsers: number
) {
  return {
    key: resourceId,
    current: { users: { value: currentUsers } },
    previous: { users: { value: previousUsers } },
  };
}

function response({
  agents,
  skills,
}: {
  agents: ReturnType<typeof bucket>[];
  skills: ReturnType<typeof bucket>[];
}) {
  return new Ok({
    aggregations: {
      agents: { buckets: agents },
      skills: { buckets: skills },
    },
  });
}

describe("discovery trending candidates", () => {
  beforeEach(() => {
    search.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shortlists both dimensions in one request and ranks distinct-user growth", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T15:03:00Z"));
    search.mockResolvedValue(
      response({
        agents: [
          bucket("highest-growth", 6, 1),
          bucket("agent-alpha", 5, 1),
          bucket("agent-lower-current", 4, 0),
          bucket("small-workspace-adoption", 2, 0),
        ],
        skills: [
          bucket("skill-alpha", 5, 1),
          bucket("skill-beta", 5, 1),
          bucket("zero-baseline", 3, 0),
          bucket("single-user-growth", 5, 4),
          bucket("not-growing", 3, 3),
        ],
      })
    );

    const result = await fetchDiscoveryTrendingCandidates(auth);

    expect(result.isOk() && result.value).toEqual([
      {
        resourceType: "agent",
        resourceId: "highest-growth",
        currentUsers: 6,
        previousUsers: 1,
        userGrowth: 5,
      },
      {
        resourceType: "agent",
        resourceId: "agent-alpha",
        currentUsers: 5,
        previousUsers: 1,
        userGrowth: 4,
      },
      {
        resourceType: "skill",
        resourceId: "skill-alpha",
        currentUsers: 5,
        previousUsers: 1,
        userGrowth: 4,
      },
      {
        resourceType: "skill",
        resourceId: "skill-beta",
        currentUsers: 5,
        previousUsers: 1,
        userGrowth: 4,
      },
      {
        resourceType: "agent",
        resourceId: "agent-lower-current",
        currentUsers: 4,
        previousUsers: 0,
        userGrowth: 4,
      },
      {
        resourceType: "skill",
        resourceId: "zero-baseline",
        currentUsers: 3,
        previousUsers: 0,
        userGrowth: 3,
      },
      {
        resourceType: "agent",
        resourceId: "small-workspace-adoption",
        currentUsers: 2,
        previousUsers: 0,
        userGrowth: 2,
      },
      {
        resourceType: "skill",
        resourceId: "single-user-growth",
        currentUsers: 5,
        previousUsers: 4,
        userGrowth: 1,
      },
    ]);
    expect(search).toHaveBeenCalledTimes(1);

    const [query, options] = search.mock.calls[0];
    expect(query).toMatchObject({
      bool: {
        filter: expect.arrayContaining([
          { term: { workspace_id: workspace.sId } },
          { terms: { context_origin: USER_USAGE_ORIGINS } },
          { exists: { field: "user.id" } },
          {
            range: {
              completed_at: {
                gte: "2026-09-08T15:03:00.000Z",
                lt: "2026-09-22T15:03:00.000Z",
              },
            },
          },
        ]),
      },
    });
    expect(options).toMatchObject({
      size: 0,
      track_total_hits: false,
      allow_partial_search_results: false,
      aggregations: {
        agents: {
          terms: {
            field: "agent.attributed_id",
            size: 25,
            order: { _count: "desc" },
          },
          aggs: {
            current: {
              filter: {
                range: {
                  completed_at: {
                    gte: "2026-09-15T15:03:00.000Z",
                    lt: "2026-09-22T15:03:00.000Z",
                  },
                },
              },
              aggs: {
                users: {
                  cardinality: {
                    field: "user.id",
                    precision_threshold: 40_000,
                  },
                },
              },
            },
            previous: {
              filter: {
                range: {
                  completed_at: {
                    gte: "2026-09-08T15:03:00.000Z",
                    lt: "2026-09-15T15:03:00.000Z",
                  },
                },
              },
            },
          },
        },
        skills: {
          terms: {
            field: "tool.attributed_skill_ids",
            size: 25,
            order: { _count: "desc" },
          },
        },
      },
    });
  });

  it.each([
    { timed_out: true },
    {},
    {
      _shards: { failed: 1 },
      aggregations: {
        agents: { buckets: [] },
        skills: { buckets: [] },
      },
    },
    {
      aggregations: {
        agents: {
          buckets: [
            {
              key: "missing-previous",
              current: { users: { value: 3 } },
            },
          ],
        },
        skills: { buckets: [] },
      },
    },
  ])("does not rank an incomplete response: %j", async (esResponse) => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    search.mockResolvedValue(new Ok(esResponse));

    const result = await fetchDiscoveryTrendingCandidates(auth);

    expect(result.isErr()).toBe(true);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("propagates the Elasticsearch failure", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const error = new ElasticsearchError("connection_error", "Search failed");
    search.mockResolvedValue(new Err(error));

    const result = await fetchDiscoveryTrendingCandidates(auth);

    expect(result).toEqual(new Err(error));
    expect(search).toHaveBeenCalledTimes(1);
  });
});
