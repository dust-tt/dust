import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => vi.fn());
const cache = vi.hoisted(() => ({ keys: [] as string[] }));
const redis = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    mGet: vi.fn(async (keys: string[]) =>
      keys.map((key) => values.get(key) ?? null)
    ),
    set: vi.fn(
      async (
        key: string,
        value: string,
        options?: { NX?: boolean }
      ): Promise<"OK" | null> => {
        if (options?.NX && values.has(key)) {
          return null;
        }
        values.set(key, value);
        return "OK";
      }
    ),
    del: vi.fn(async (key: string | string[]) => {
      for (const value of Array.isArray(key) ? key : [key]) {
        values.delete(value);
      }
    }),
    eval: vi.fn(
      async (
        _script: string,
        { keys, arguments: args }: { keys: string[]; arguments: string[] }
      ) => {
        const [key] = keys;
        const [expectedValue] = args;
        if (key && values.get(key) === expectedValue) {
          values.delete(key);
          return 1;
        }
        return 0;
      }
    ),
  };
});

vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...original,
    searchConsumptionAnalytics: search,
  };
});

vi.mock("@app/lib/api/redis", async (importOriginal) => {
  const original = await importOriginal<typeof import("@app/lib/api/redis")>();
  return {
    ...original,
    getRedisCacheClient: vi.fn().mockResolvedValue(redis),
  };
});

vi.mock("@app/lib/utils/cache", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/utils/cache")>();
  return {
    ...original,
    cacheWithRedisResult: vi
      .fn()
      .mockImplementation(
        <T, Args extends unknown[]>(
          fn: (...args: Args) => Promise<T>,
          resolver: (...args: Args) => string
        ) =>
          async (...args: Args): Promise<T> => {
            cache.keys.push(resolver(...args));
            return fn(...args);
          }
      ),
  };
});

import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { GroupResource } from "@app/lib/resources/group_resource";
import { fetchDiscoveryForYouCandidates } from "@app/lib/search_usage/for_you";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";

function groupCandidateBucket(resourceId: string, users: number) {
  return {
    key: resourceId,
    users: { value: users },
  };
}

type GroupResponseSpec = Record<
  string,
  {
    activeUsers: number;
    agents?: ReturnType<typeof groupCandidateBucket>[];
    skills?: ReturnType<typeof groupCandidateBucket>[];
  }
>;

function groupShortlistResponse(groups: GroupResponseSpec) {
  return new Ok({
    aggregations: {
      group_shortlists: {
        buckets: Object.fromEntries(
          Object.entries(groups).map(
            ([groupId, { agents = [], skills = [] }]) => [
              groupId,
              {
                agents: { buckets: agents },
                skills: { buckets: skills },
              },
            ]
          )
        ),
      },
    },
  });
}

function groupPoolResponse(groups: GroupResponseSpec) {
  return new Ok({
    aggregations: {
      group_pools: {
        ...Object.fromEntries(
          Object.entries(groups).map(
            ([groupId, { activeUsers, agents = [], skills = [] }]) => [
              groupId,
              {
                active_users: { value: activeUsers },
                agents: {
                  buckets: Object.fromEntries(
                    agents.map(({ key, users }) => [key, { users }])
                  ),
                },
                skills: {
                  buckets: Object.fromEntries(
                    skills.map(({ key, users }) => [key, { users }])
                  ),
                },
              },
            ]
          )
        ),
      },
    },
  });
}

function viewerUsageBucket(resourceId: string, conversations: number) {
  return {
    key: resourceId,
    conversations: { value: conversations },
  };
}

function viewerUsageResponse({
  agents = [],
  skills = [],
}: {
  agents?: ReturnType<typeof viewerUsageBucket>[];
  skills?: ReturnType<typeof viewerUsageBucket>[];
} = {}) {
  return new Ok({
    aggregations: {
      agents: { buckets: agents },
      skills: { buckets: skills },
    },
  });
}

function mockViewerGroups(groupIds: string[]) {
  return vi
    .spyOn(GroupResource, "listUserGroupsInWorkspace")
    .mockResolvedValue(
      groupIds.map((sId) => ({ sId })) as unknown as GroupResource[]
    );
}

describe("discovery for-you candidates", () => {
  beforeEach(() => {
    search.mockReset();
    cache.keys.length = 0;
    redis.values.clear();
    redis.get.mockClear();
    redis.mGet.mockClear();
    redis.set.mockClear();
    redis.del.mockClear();
    redis.eval.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("ranks the strongest group opportunity with continuous viewer novelty", async () => {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    redis.set.mockClear();
    mockViewerGroups(["group-small", "group-large", "group-small"]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T15:03:00Z"));

    const groups = {
      "group-large": {
        activeUsers: 10,
        agents: [
          groupCandidateBucket("dust", 10),
          groupCandidateBucket("agent-unused", 5),
          groupCandidateBucket("agent-used", 9),
        ],
        skills: [groupCandidateBucket("skill-used", 7)],
      },
      "group-small": {
        activeUsers: 2,
        agents: [
          groupCandidateBucket("agent-unused", 1),
          groupCandidateBucket("agent-tiny-group", 1),
        ],
      },
    };
    search.mockImplementation(
      (_query, options: { aggregations: Record<string, unknown> }) => {
        if ("group_shortlists" in options.aggregations) {
          return groupShortlistResponse(groups);
        }
        if ("group_pools" in options.aggregations) {
          return groupPoolResponse(groups);
        }
        return viewerUsageResponse({
          agents: [viewerUsageBucket("agent-used", 4)],
          skills: [viewerUsageBucket("skill-used", 1)],
        });
      }
    );

    const result = await fetchDiscoveryForYouCandidates(auth);

    expect(
      result.isOk() && result.value?.map(({ resourceId }) => resourceId)
    ).toEqual(["agent-unused", "agent-tiny-group", "skill-used", "agent-used"]);
    expect(result.isOk() && result.value?.[0]).toMatchObject({
      resourceId: "agent-unused",
      reasonGroupId: "group-large",
      peerUsers: 5,
      groupActivePeers: 9,
    });
    expect(result.isOk() && result.value?.[0]?.score).toBeCloseTo(
      ((5 + 1) / (9 + 2)) *
        (0.5 + 0.5 * (9 / (9 + 5))) *
        (1 + 0.25 / Math.sqrt(9 + 1))
    );
    expect(result.isOk() && result.value?.[2]).toMatchObject({
      resourceType: "skill",
      resourceId: "skill-used",
      reasonGroupId: "group-large",
      peerUsers: 6,
      groupActivePeers: 9,
      viewerConversations: 1,
    });
    expect(result.isOk() && result.value?.[3]).toMatchObject({
      resourceId: "agent-used",
      viewerConversations: 4,
    });
    expect(result.isOk() && result.value?.some(({ score }) => score <= 0)).toBe(
      false
    );

    expect(GroupResource.listUserGroupsInWorkspace).toHaveBeenCalledWith({
      auth,
      user,
      groupKinds: ["provisioned", "regular_manual"],
    });
    expect(search).toHaveBeenCalledTimes(3);

    const shortlistSearch = search.mock.calls.find(
      ([, options]) => "group_shortlists" in options.aggregations
    );
    expect(shortlistSearch).toBeDefined();
    expect(shortlistSearch?.[0]).toMatchObject({
      bool: {
        filter: expect.arrayContaining([
          { term: { workspace_id: workspace.sId } },
          { terms: { context_origin: USER_USAGE_ORIGINS } },
          { exists: { field: "user.id" } },
          {
            terms: {
              "user.group_ids": ["group-large", "group-small"],
            },
          },
          {
            range: {
              completed_at: {
                gte: "2026-08-23T15:03:00.000Z",
                lt: "2026-09-22T15:03:00.000Z",
              },
            },
          },
        ]),
      },
    });
    expect(shortlistSearch?.[1]).toMatchObject({
      size: 0,
      track_total_hits: false,
      allow_partial_search_results: false,
      aggregations: {
        group_shortlists: {
          filters: {
            filters: {
              "group-large": {
                term: { "user.group_ids": "group-large" },
              },
              "group-small": {
                term: { "user.group_ids": "group-small" },
              },
            },
          },
          aggs: {
            agents: {
              terms: {
                field: "agent.attributed_id",
                size: 25,
                order: [{ users: "desc" }, { _key: "asc" }],
              },
            },
            skills: {
              terms: {
                field: "tool.attributed_skill_ids",
                size: 25,
              },
            },
          },
        },
      },
    });

    const recomputedSearch = search.mock.calls.find(
      ([, options]) => "group_pools" in options.aggregations
    );
    expect(recomputedSearch?.[1]).toMatchObject({
      aggregations: {
        group_pools: {
          aggs: {
            "group-large": {
              filter: { term: { "user.group_ids": "group-large" } },
              aggs: {
                active_users: {
                  cardinality: {
                    field: "user.id",
                    precision_threshold: 1_000,
                  },
                },
                agents: {
                  filters: {
                    filters: {
                      dust: { term: { "agent.attributed_id": "dust" } },
                      "agent-unused": {
                        term: { "agent.attributed_id": "agent-unused" },
                      },
                      "agent-used": {
                        term: { "agent.attributed_id": "agent-used" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const viewerSearch = search.mock.calls.find(
      ([, options]) =>
        "agents" in options.aggregations && "skills" in options.aggregations
    );
    expect(viewerSearch?.[0]).toMatchObject({
      bool: {
        filter: expect.arrayContaining([{ term: { "user.id": user.sId } }]),
      },
    });
    expect(viewerSearch?.[1]).toMatchObject({
      aggregations: {
        agents: {
          terms: { field: "agent.attributed_id", size: 1_000 },
          aggs: {
            conversations: {
              cardinality: {
                field: "conversation_id",
                precision_threshold: 1_000,
              },
            },
          },
        },
      },
    });
    const poolWrites = redis.set.mock.calls.filter(
      ([key]) => !key.startsWith("lock:")
    );
    expect(poolWrites).toHaveLength(2);
    expect(poolWrites.map(([key]) => key)).toEqual(
      expect.arrayContaining([
        `discovery-for-you-group-pool:v1:${workspace.sId}:group-large`,
        `discovery-for-you-group-pool:v1:${workspace.sId}:group-small`,
      ])
    );
    expect(cache.keys).toEqual([`v1:${workspace.sId}:${user.sId}`]);
  });

  it("reuses independently cached group pools", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    redis.set.mockClear();
    mockViewerGroups(["group-a", "group-b"]);
    const groups = {
      "group-a": { activeUsers: 3 },
      "group-b": { activeUsers: 4 },
    };
    search.mockImplementation(
      (_query, options: { aggregations: Record<string, unknown> }) => {
        if ("group_shortlists" in options.aggregations) {
          return groupShortlistResponse(groups);
        }
        return "group_pools" in options.aggregations
          ? groupPoolResponse(groups)
          : viewerUsageResponse();
      }
    );

    await fetchDiscoveryForYouCandidates(auth);
    await fetchDiscoveryForYouCandidates(auth);

    expect(
      search.mock.calls.filter(
        ([, options]) => "group_shortlists" in options.aggregations
      )
    ).toHaveLength(1);
    expect(
      search.mock.calls.filter(
        ([, options]) => "group_pools" in options.aggregations
      )
    ).toHaveLength(1);
    expect(redis.mGet).toHaveBeenCalledTimes(4);
    expect(
      redis.set.mock.calls.filter(([key]) => !key.startsWith("lock:"))
    ).toHaveLength(2);
  });

  it("does not refresh a group pool while another caller holds its lock", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    redis.set.mockClear();
    mockViewerGroups(["group-a"]);
    redis.values.set(
      `lock:discovery-for-you-group-pool-refresh:v1:${workspace.sId}`,
      "other-caller"
    );
    search.mockImplementation(
      (_query, options: { aggregations: Record<string, unknown> }) => {
        if (
          "group_shortlists" in options.aggregations ||
          "group_pools" in options.aggregations
        ) {
          throw new Error("Duplicate group refresh");
        }
        return viewerUsageResponse();
      }
    );

    const result = await fetchDiscoveryForYouCandidates(auth);

    expect(result).toEqual(new Ok(null));
    expect(search).toHaveBeenCalledTimes(1);
    expect(redis.mGet).toHaveBeenCalledTimes(1);
  });

  it("omits candidates without peer evidence", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    redis.set.mockClear();
    mockViewerGroups(["group-a"]);
    const groups = {
      "group-a": {
        activeUsers: 1,
        skills: [groupCandidateBucket("skill-viewer-only", 1)],
      },
    };
    search.mockImplementation(
      (_query, options: { aggregations: Record<string, unknown> }) => {
        if ("group_shortlists" in options.aggregations) {
          return groupShortlistResponse(groups);
        }
        return "group_pools" in options.aggregations
          ? groupPoolResponse(groups)
          : viewerUsageResponse({
              skills: [viewerUsageBucket("skill-viewer-only", 1)],
            });
      }
    );

    const result = await fetchDiscoveryForYouCandidates(auth);

    expect(result).toEqual(new Ok([]));
  });

  it("caps eligible groups at the safety ceiling", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    redis.set.mockClear();
    const groupIds = Array.from({ length: 60 }, (_, index) => `group-${index}`);
    mockViewerGroups(groupIds);
    search.mockImplementation(
      (_query, options: { aggregations: Record<string, unknown> }) => {
        const shortlists = options.aggregations.group_shortlists as
          | {
              filters: { filters: Record<string, unknown> };
            }
          | undefined;
        if (shortlists) {
          return groupShortlistResponse(
            Object.fromEntries(
              Object.keys(shortlists.filters.filters).map((groupId) => [
                groupId,
                { activeUsers: 2 },
              ])
            )
          );
        }

        const groupPools = options.aggregations.group_pools as
          | { aggs: Record<string, unknown> }
          | undefined;
        if (groupPools) {
          return groupPoolResponse(
            Object.fromEntries(
              Object.keys(groupPools.aggs).map((groupId) => [
                groupId,
                { activeUsers: 2 },
              ])
            )
          );
        }
        return viewerUsageResponse();
      }
    );

    const result = await fetchDiscoveryForYouCandidates(auth);

    expect(result).toEqual(new Ok([]));
    expect(
      search.mock.calls.filter(
        ([, options]) => "group_shortlists" in options.aggregations
      )
    ).toHaveLength(1);
    expect(
      search.mock.calls.filter(
        ([, options]) => "group_pools" in options.aggregations
      )
    ).toHaveLength(1);
    const shortlistSearch = search.mock.calls.find(
      ([, options]) => "group_shortlists" in options.aggregations
    );
    const groupShortlists = shortlistSearch?.[1].aggregations
      .group_shortlists as { filters: { filters: Record<string, unknown> } };
    expect(Object.keys(groupShortlists.filters.filters)).toHaveLength(50);
  });

  it("does not query Elasticsearch without a meaningful shared group", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    mockViewerGroups([]);

    const result = await fetchDiscoveryForYouCandidates(auth);

    expect(result).toEqual(new Ok([]));
    expect(search).not.toHaveBeenCalled();
    expect(redis.mGet).not.toHaveBeenCalled();
  });

  it("rejects a malformed group pool response", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    mockViewerGroups(["group-a"]);
    search.mockImplementation(
      (_query, options: { aggregations: Record<string, unknown> }) =>
        "group_shortlists" in options.aggregations
          ? new Ok({
              aggregations: {
                group_shortlists: {
                  buckets: {
                    "group-a": {
                      skills: { buckets: [] },
                    },
                  },
                },
              },
            })
          : viewerUsageResponse()
    );

    const result = await fetchDiscoveryForYouCandidates(auth);

    expect(result.isErr()).toBe(true);
  });

  it("propagates an Elasticsearch failure", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    mockViewerGroups(["group-a"]);
    const error = new ElasticsearchError("connection_error", "Search failed");
    search.mockImplementation(
      (_query, options: { aggregations: Record<string, unknown> }) =>
        "group_shortlists" in options.aggregations
          ? new Err(error)
          : viewerUsageResponse()
    );

    const result = await fetchDiscoveryForYouCandidates(auth);

    expect(result).toEqual(new Err(error));
  });
});
