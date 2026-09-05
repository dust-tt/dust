import { listConsumptionFacetCatalogDimension } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  fetchConsumptionTopGroups as fetchConsumptionTopGroupBuckets,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import { fetchConsumptionTopAgents } from "@app/lib/api/analytics/consumption/top_agents";
import { fetchConsumptionTopApiKeys } from "@app/lib/api/analytics/consumption/top_api_keys";
import { fetchConsumptionTopConversations } from "@app/lib/api/analytics/consumption/top_conversations";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top_groups";
import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";
import { fetchConsumptionTopReasoningEfforts } from "@app/lib/api/analytics/consumption/top_reasoning_efforts";
import { fetchConsumptionTopSkills } from "@app/lib/api/analytics/consumption/top_skills";
import { fetchConsumptionTopSources } from "@app/lib/api/analytics/consumption/top_sources";
import { fetchConsumptionTopTools } from "@app/lib/api/analytics/consumption/top_tools";
import { fetchConsumptionTopUsers } from "@app/lib/api/analytics/consumption/top_users";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(
  import("@app/lib/api/analytics/consumption/facet_catalog"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, listConsumptionFacetCatalogDimension: vi.fn() };
  }
);

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

function esResponse(aggregations: unknown) {
  return new Ok({ aggregations }) as Awaited<
    ReturnType<typeof searchConsumptionAnalytics>
  >;
}

function mockAggs({
  buckets,
  totalCount = buckets.length,
  totalMicro,
  totalActiveMembers = 0,
  filtered = false,
}: {
  buckets: Array<Record<string, unknown> & { key: string }>;
  totalCount?: number;
  totalMicro: number;
  totalActiveMembers?: number;
  filtered?: boolean;
}) {
  vi.mocked(searchConsumptionAnalytics).mockImplementation(
    async (_query, options) => {
      const terms =
        options?.aggregations?.by_group?.terms ??
        options?.aggregations?.ranking?.aggs?.by_group?.terms;
      const includedKeys = Array.isArray(terms?.include)
        ? new Set(terms.include.map(String))
        : null;
      const excludedKeys = new Set(
        Array.isArray(terms?.exclude) ? terms.exclude.map(String) : []
      );
      const ranking = {
        by_group: {
          buckets: buckets
            .filter(({ key }) =>
              includedKeys ? includedKeys.has(key) : !excludedKeys.has(key)
            )
            .slice(0, terms?.size),
        },
        total_count: { value: totalCount },
      };
      return esResponse({
        ...(filtered ? { ranking } : ranking),
        total_credit_micro: { value: totalMicro },
        active_members: { value: totalActiveMembers },
      });
    }
  );
}

function mockLabels(labels: Record<string, string>) {
  vi.mocked(resolveDimensionLabels).mockResolvedValue(
    new Map(
      Object.entries(labels).map(([key, name]) => [
        key,
        { name, pictureUrl: null, description: null },
      ])
    )
  );
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth };
}

// The last search the code under test issued, as [query, options].
function lastSearchCall() {
  const calls = vi.mocked(searchConsumptionAnalytics).mock.calls;
  return calls[calls.length - 1];
}

// The ranking search — always the first call, since a second call for the
// previous-period comparison follows it whenever the ranking has keys.
function rankingSearchCall() {
  return vi.mocked(searchConsumptionAnalytics).mock.calls[0];
}

describe("consumption top rankings", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(listConsumptionFacetCatalogDimension).mockReset();
    vi.mocked(resolveDimensionLabels).mockReset();
  });

  it("ranks agents on gross credits and averages over distinct messages", async () => {
    const { auth } = await setup();
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "agent1",
          {
            name: "@dust",
            pictureUrl: "http://pic/dust",
            description: "Answers questions about Dust",
            modelId: "claude-4-sonnet",
            modelDisplayName: "Claude 4 Sonnet",
          },
        ],
      ])
    );
    mockAggs({
      buckets: [
        {
          key: "agent1",
          doc_count: 7,
          credit_micro: { value: 3_000_000 },
          messages: { value: 2 },
        },
      ],
      totalMicro: 5_000_000,
    });

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.period).toEqual(PERIOD);
    expect(result.value.totalCredits).toBe(5);
    expect(result.value.totalCount).toBe(1);
    expect(result.value.hasMore).toBe(false);
    expect(result.value.agents).toEqual([
      {
        agentId: "agent1",
        name: "@dust",
        pictureUrl: "http://pic/dust",
        description: "Answers questions about Dust",
        modelId: "claude-4-sonnet",
        modelDisplayName: "Claude 4 Sonnet",
        credits: 3,
        // The mocked search response is reused for the previous-period
        // query too, so the previous credits come out equal.
        previousCredits: 3,
        // The 7 documents of the bucket belong to 2 messages.
        messageCount: 2,
        avgCreditsPerMessage: 1.5,
      },
    ]);

    // Ranked on the attributed agent by gross credits, with a per-message cardinality
    // sub-aggregation because a message spans several documents.
    const [query, options] = rankingSearchCall();
    expect(query.bool?.filter).toContainEqual({
      range: { completed_at: { gte: PERIOD.startDate, lt: PERIOD.endDate } },
    });
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "agent.attributed_id",
      size: 10,
      order: { credit_micro: "desc" },
    });
    expect(
      options?.aggregations?.by_group?.aggs?.credit_micro?.sum?.field
    ).toBe("credit_micro");
    expect(
      options?.aggregations?.by_group?.aggs?.messages?.cardinality?.field
    ).toBe("agent_message_id");
    expect(options?.aggregations?.total_credit_micro?.sum?.field).toBe(
      "credit_micro"
    );
    expect(options?.aggregations?.total_count?.cardinality).toEqual({
      field: "agent.attributed_id",
      precision_threshold: 40_000,
    });
    expect(options?.aggregations?.ranking).toBeUndefined();
  });

  it("fetches only enough terms batches for the requested page", async () => {
    const { auth } = await setup();
    const buckets = Array.from({ length: 1_001 }, (_, index) => ({
      key: `agent${index}`,
      doc_count: 1,
      credit_micro: { value: 1_001_000_000 - index * 1_000_000 },
      messages: { value: 1 },
    }));
    mockLabels({ agent1000: "Agent 1000" });
    mockAggs({
      buckets,
      totalMicro: 1_001_000_000,
    });

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 1,
      offset: 1_000,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.agents.map((agent) => agent.agentId)).toEqual([
      "agent1000",
    ]);
    expect(result.value.hasMore).toBe(false);
    expect(result.value.totalCount).toBe(1_001);
    const calls = vi.mocked(searchConsumptionAnalytics).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]?.[1]?.aggregations?.by_group?.terms).toMatchObject({
      size: 1_000,
    });
    expect(
      calls[0]?.[1]?.aggregations?.by_group?.terms?.exclude
    ).toBeUndefined();
    expect(calls[1]?.[1]?.aggregations?.by_group?.terms?.size).toBe(1);
    expect(calls[1]?.[1]?.aggregations?.by_group?.terms?.exclude).toHaveLength(
      1_000
    );
  });

  it.each([
    [
      "AGENT 080",
      "Pagination Agent 080",
      { terms: { "agent.attributed_id": ["agent80"] } },
    ],
    [
      "developpeur",
      "Développeur",
      { terms: { "agent.attributed_id": ["agent80"] } },
    ],
    [
      "développeur",
      "Developpeur",
      { terms: { "agent.attributed_id": ["agent80"] } },
    ],
    ["missing", "Pagination Agent 080", { match_none: {} }],
  ])("filters the ranking for search %s", async (search, label, expectedFilter) => {
    const { auth } = await setup();
    vi.mocked(listConsumptionFacetCatalogDimension).mockResolvedValue([
      { value: "agent80", label, pictureUrl: null },
    ]);
    mockLabels({});
    mockAggs({
      buckets: [],
      totalCount: 0,
      totalMicro: 10_000_000,
      filtered: true,
    });

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 25,
      search,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.totalCredits).toBe(10);
    expect(listConsumptionFacetCatalogDimension).toHaveBeenCalledWith(
      auth,
      "agent"
    );
    expect(lastSearchCall()[1]?.aggregations?.ranking?.filter).toEqual(
      expectedFilter
    );
  });

  it("splits broad searches into bounded terms clauses", async () => {
    const { auth } = await setup();
    vi.mocked(listConsumptionFacetCatalogDimension).mockResolvedValue(
      Array.from({ length: 65_537 }, (_, index) => ({
        value: `agent${index}`,
        label: "Agent",
        pictureUrl: null,
      }))
    );
    mockLabels({});
    mockAggs({
      buckets: [],
      totalCount: 0,
      totalMicro: 0,
      filtered: true,
    });

    await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 25,
      search: "agent",
    });

    const searchFilter = lastSearchCall()[1]?.aggregations?.ranking?.filter;
    expect(searchFilter?.bool?.minimum_should_match).toBe(1);

    const termsClauses = searchFilter?.bool?.should;
    expect(Array.isArray(termsClauses)).toBe(true);
    if (!Array.isArray(termsClauses)) {
      return;
    }

    expect(termsClauses).toHaveLength(2);
    expect(termsClauses[0]?.terms?.["agent.attributed_id"]).toHaveLength(
      65_536
    );
    expect(termsClauses[1]?.terms?.["agent.attributed_id"]).toHaveLength(1);
  });

  it("filters skill management from the tool response", async () => {
    const { auth } = await setup();
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "web_search_browse",
          {
            name: "Web Search & Browse",
            pictureUrl: null,
            description: null,
            icon: "Globe01Icon",
          },
        ],
      ])
    );
    mockAggs({
      buckets: [
        {
          key: "skill_management",
          doc_count: 5,
          credit_micro: { value: 3_000_000 },
        },
        {
          key: "web_search_browse",
          doc_count: 4,
          credit_micro: { value: 2_000_000 },
        },
      ],
      totalCount: 2,
      totalMicro: 10_000_000,
    });

    const result = await fetchConsumptionTopTools(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.tools).toEqual([
      {
        serverName: "web_search_browse",
        name: "Web Search & Browse",
        icon: "Globe01Icon",
        credits: 2,
        previousCredits: 2,
        // 4 tool documents, one per call — not a message cardinality.
        invocationCount: 4,
        avgCreditsPerInvocation: 0.5,
      },
    ]);
    // Only the hidden tool's credits are removed from the share denominator.
    expect(result.value.totalCredits).toBe(7);

    const [query] = rankingSearchCall();
    expect(query.bool?.filter).not.toContainEqual({
      bool: {
        must_not: [{ terms: { "tool.server_name": ["skill_management"] } }],
      },
    });

    const [, options] = rankingSearchCall();
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "tool.server_name",
    });
    expect(options?.aggregations?.by_group?.aggs?.messages).toBeUndefined();
  });

  it("ranks API key names on gross credits per distinct message", async () => {
    const { auth } = await setup();
    vi.mocked(listConsumptionFacetCatalogDimension).mockResolvedValue([
      {
        value: "Production key",
        label: "Production key",
        pictureUrl: null,
      },
    ]);
    mockLabels({ "Production key": "Production key" });
    mockAggs({
      buckets: [
        {
          key: "Production key",
          doc_count: 6,
          credit_micro: { value: 3_000_000 },
          messages: { value: 2 },
        },
      ],
      totalMicro: 5_000_000,
      filtered: true,
    });

    const result = await fetchConsumptionTopApiKeys(auth, {
      period: PERIOD,
      limit: 10,
      search: "production",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.apiKeys).toEqual([
      {
        apiKeyName: "Production key",
        name: "Production key",
        credits: 3,
        // The filtered ranking's response nests buckets under `ranking`,
        // which the previous-period query doesn't produce, so no match.
        previousCredits: null,
        messageCount: 2,
        avgCreditsPerMessage: 1.5,
      },
    ]);

    const [, options] = rankingSearchCall();
    expect(listConsumptionFacetCatalogDimension).toHaveBeenCalledWith(
      auth,
      "api_key"
    );
    expect(options?.aggregations?.ranking?.filter).toEqual({
      terms: { api_key_name: ["Production key"] },
    });
    expect(options?.aggregations?.ranking?.aggs?.by_group?.terms).toMatchObject(
      {
        field: "api_key_name",
      }
    );
    expect(
      options?.aggregations?.ranking?.aggs?.by_group?.aggs?.messages
        ?.cardinality?.field
    ).toBe("agent_message_id");
  });

  it("credits a skill with the invocations attributed to it", async () => {
    const { auth } = await setup();
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "skl_1",
          {
            name: "Research",
            pictureUrl: null,
            description: "Researches a topic in depth",
            icon: "search",
          },
        ],
      ])
    );
    mockAggs({
      buckets: [
        { key: "skl_1", doc_count: 5, credit_micro: { value: 2_500_000 } },
      ],
      totalMicro: 10_000_000,
    });

    const result = await fetchConsumptionTopSkills(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.skills).toEqual([
      {
        skillId: "skl_1",
        name: "Research",
        description: "Researches a topic in depth",
        icon: "search",
        credits: 2.5,
        previousCredits: 2.5,
        invocationCount: 5,
        avgCreditsPerInvocation: 0.5,
      },
    ]);

    const [, options] = lastSearchCall();
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "tool.attributed_skill_ids",
    });
    expect(options?.aggregations?.by_group?.aggs?.messages).toBeUndefined();
  });

  it("ranks users, groups and models per message on their own key", async () => {
    const { auth } = await setup();
    mockAggs({
      buckets: [
        {
          key: "key1",
          doc_count: 6,
          credit_micro: { value: 2_000_000 },
          messages: { value: 4 },
          active_members: { value: 2 },
        },
      ],
      totalMicro: 2_000_000,
      totalActiveMembers: 3,
    });

    mockLabels({ key1: "Jane Doe" });
    const users = await fetchConsumptionTopUsers(auth, {
      period: PERIOD,
      limit: 10,
    });
    expect(users.isOk()).toBe(true);
    if (!users.isOk()) {
      return;
    }
    expect(users.value.users[0]).toEqual({
      userId: "key1",
      name: "Jane Doe",
      pictureUrl: null,
      credits: 2,
      previousCredits: 2,
      messageCount: 4,
      avgCreditsPerMessage: 0.5,
    });
    expect(lastSearchCall()[1]?.aggregations?.by_group?.terms).toMatchObject({
      field: "user.id",
    });

    vi.mocked(searchConsumptionAnalytics).mockClear();
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "key1",
          {
            name: "Engineering",
            pictureUrl: null,
            description: null,
            memberCount: 5,
          },
        ],
      ])
    );
    const groups = await fetchConsumptionTopGroups(auth, {
      period: PERIOD,
      limit: 10,
    });
    expect(groups.isOk()).toBe(true);
    if (!groups.isOk()) {
      return;
    }
    expect(groups.value.groups[0]).toEqual({
      groupId: "key1",
      name: "Engineering",
      credits: 2,
      activeMembers: 2,
      totalMembers: 5,
      previousCredits: 2,
      messageCount: 4,
      avgCreditsPerMessage: 0.5,
    });
    expect(groups.value.totalActiveMembers).toBe(3);
    const [, groupRankingOptions] = rankingSearchCall();
    expect(groupRankingOptions?.aggregations?.by_group?.terms).toMatchObject({
      field: "user.group_ids",
    });
    expect(
      groupRankingOptions?.aggregations?.by_group?.aggs?.active_members
        ?.cardinality
    ).toMatchObject({ field: "user.id" });
    expect(
      groupRankingOptions?.aggregations?.active_members?.cardinality
    ).toMatchObject({ field: "user.id" });

    mockLabels({ key1: "Claude 4 Sonnet" });
    const models = await fetchConsumptionTopModels(auth, {
      period: PERIOD,
      limit: 10,
    });
    expect(models.isOk()).toBe(true);
    if (!models.isOk()) {
      return;
    }
    expect(models.value.models[0]).toEqual({
      modelId: "key1",
      name: "Claude 4 Sonnet",
      credits: 2,
      previousCredits: 2,
      messageCount: 4,
      avgCreditsPerMessage: 0.5,
    });
    expect(lastSearchCall()[1]?.aggregations?.by_group?.terms).toMatchObject({
      field: "model.model_id",
    });
  });

  it.each([
    {
      sortOrder: "desc" as const,
      offset: 1,
      limit: 3,
      expectedGroupIds: ["group-b", "group-e", "group-a"],
    },
    {
      sortOrder: "asc" as const,
      offset: 1,
      limit: 3,
      expectedGroupIds: ["group-b", "group-e", "group-c"],
    },
    {
      sortOrder: "desc" as const,
      offset: 0,
      limit: 5,
      expectedGroupIds: ["group-c", "group-b", "group-e", "group-a", "group-d"],
    },
    {
      sortOrder: "asc" as const,
      offset: 0,
      limit: 5,
      expectedGroupIds: ["group-a", "group-b", "group-e", "group-c", "group-d"],
    },
  ])("sorts groups by workspace-average usage $sortOrder with offset $offset", async ({
    sortOrder,
    offset,
    limit,
    expectedGroupIds,
  }) => {
    const { auth } = await setup();
    mockLabels({
      "group-a": "Group A",
      "group-b": "Group B",
      "group-c": "Group C",
    });
    vi.mocked(searchConsumptionAnalytics).mockImplementation(
      async (_query, options) => {
        const composite = options?.aggregations?.by_group?.composite;
        if (composite) {
          const isSecondPage = composite.after !== undefined;
          return esResponse({
            by_group: {
              buckets: isSecondPage
                ? [
                    {
                      key: { group: "group-c" },
                      doc_count: 1,
                      credit_micro: { value: 40_000_000 },
                      messages: { value: 1 },
                      active_members: { value: 1 },
                    },
                    {
                      key: { group: "group-d" },
                      doc_count: 1,
                      credit_micro: { value: 20_000_000 },
                      messages: { value: 1 },
                      active_members: { value: 0 },
                    },
                    {
                      key: { group: "group-e" },
                      doc_count: 3,
                      credit_micro: { value: 90_000_000 },
                      messages: { value: 3 },
                      active_members: { value: 3 },
                    },
                  ]
                : [
                    {
                      key: { group: "group-a" },
                      doc_count: 10,
                      credit_micro: { value: 100_000_000 },
                      messages: { value: 10 },
                      active_members: { value: 10 },
                    },
                    {
                      key: { group: "group-b" },
                      doc_count: 2,
                      credit_micro: { value: 60_000_000 },
                      messages: { value: 2 },
                      active_members: { value: 2 },
                    },
                  ],
              ...(isSecondPage ? {} : { after_key: { group: "group-b" } }),
            },
            ...(!isSecondPage
              ? {
                  total_credit_micro: { value: 200_000_000 },
                  active_members: { value: 12 },
                }
              : {}),
          });
        }

        const terms = options?.aggregations?.by_group?.terms;
        const includedKeys = Array.isArray(terms?.include)
          ? terms.include.map(String)
          : [];
        return esResponse({
          by_group: {
            buckets: includedKeys.map((key) => ({
              key,
              doc_count: 1,
              credit_micro: { value: 1_000_000 },
            })),
          },
        });
      }
    );

    const result = await fetchConsumptionTopGroups(auth, {
      period: PERIOD,
      limit,
      offset,
      sortBy: "workspace_average",
      sortOrder,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.groups.map((group) => group.groupId)).toEqual(
      expectedGroupIds
    );
    expect(result.value.totalCredits).toBe(200);
    expect(result.value.totalActiveMembers).toBe(12);
    expect(result.value.totalCount).toBe(5);
    expect(result.value.hasMore).toBe(offset + limit < 5);
    expect(result.value.groups.map((group) => group.previousCredits)).toEqual(
      expectedGroupIds.map(() => 1)
    );

    const compositeCalls = vi
      .mocked(searchConsumptionAnalytics)
      .mock.calls.filter(
        ([, options]) => options?.aggregations?.by_group?.composite
      );
    expect(compositeCalls).toHaveLength(2);
    expect(
      compositeCalls[0]?.[1]?.aggregations?.by_group?.composite
    ).toMatchObject({
      size: 1_000,
      sources: [{ group: { terms: { field: "user.group_ids" } } }],
    });
    expect(
      compositeCalls[1]?.[1]?.aggregations?.by_group?.composite?.after
    ).toEqual({ group: "group-b" });
    expect(
      compositeCalls[1]?.[1]?.aggregations?.total_credit_micro
    ).toBeUndefined();
    expect(
      compositeCalls[1]?.[1]?.aggregations?.active_members
    ).toBeUndefined();
  });

  it("ranks reasoning efforts per message for the selected model", async () => {
    const { auth } = await setup();
    mockAggs({
      buckets: [
        {
          key: "medium",
          doc_count: 6,
          credit_micro: { value: 2_000_000 },
          messages: { value: 4 },
        },
      ],
      totalMicro: 2_000_000,
    });

    const result = await fetchConsumptionTopReasoningEfforts(auth, {
      period: PERIOD,
      limit: 3,
      filter: { models: ["claude-sonnet-4-6"] },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.reasoningEfforts).toEqual([
      {
        reasoningEffort: "medium",
        name: "Medium",
        credits: 2,
        previousCredits: 2,
        messageCount: 4,
        avgCreditsPerMessage: 0.5,
      },
    ]);
    const [query, options] = rankingSearchCall();
    expect(query.bool?.filter).toContainEqual({
      term: { "model.model_id": "claude-sonnet-4-6" },
    });
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "model.reasoning_effort",
    });
    expect(
      options?.aggregations?.by_group?.aggs?.messages?.cardinality?.field
    ).toBe("agent_message_id");
  });

  it("keys sources on the raw context origin so the row can be filtered on", async () => {
    const { auth } = await setup();
    mockLabels({ web: "Conversation" });
    mockAggs({
      buckets: [
        {
          key: "web",
          doc_count: 10,
          credit_micro: { value: 4_000_000 },
          messages: { value: 4 },
        },
      ],
      totalMicro: 4_000_000,
    });

    const result = await fetchConsumptionTopSources(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.sources[0]).toEqual({
      source: "web",
      name: "Conversation",
      credits: 4,
      previousCredits: 4,
      messageCount: 4,
      avgCreditsPerMessage: 1,
    });
    expect(lastSearchCall()[1]?.aggregations?.by_group?.terms).toMatchObject({
      field: "normalized_origin",
    });
  });

  it("ranks deleted conversations from the consumption index", async () => {
    const { auth } = await setup();
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "unused",
      messagesCreatedAt: [],
      visibility: "deleted",
    });
    mockAggs({
      buckets: [
        {
          key: conversation.sId,
          doc_count: 4,
          credit_micro: { value: 6_000_000 },
          messages: { value: 2 },
        },
      ],
      totalMicro: 6_000_000,
    });

    const result = await fetchConsumptionTopConversations(auth, {
      period: PERIOD,
      limit: 10,
      filter: { users: ["user1"] },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.conversations).toEqual([
      {
        conversationId: conversation.sId,
        title: "Test Conversation",
        totalCredits: 6,
      },
    ]);

    const [query, options] = rankingSearchCall();
    expect(query.bool?.filter).toContainEqual({
      term: { "user.id": "user1" },
    });
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "conversation_id",
      order: { credit_micro: "desc" },
    });
    expect(
      options?.aggregations?.by_group?.aggs?.messages?.cardinality?.field
    ).toBe("agent_message_id");
  });

  it("narrows the scope with the requested filter", async () => {
    const { auth } = await setup();
    mockLabels({});
    mockAggs({ buckets: [], totalMicro: 0 });

    await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 10,
      filter: { sources: ["slack"], users: ["u1", "u2"] },
    });

    const [query] = lastSearchCall();
    expect(query.bool?.filter).toContainEqual({
      term: { normalized_origin: "slack" },
    });
    expect(query.bool?.filter).toContainEqual({
      terms: { "user.id": ["u1", "u2"] },
    });
  });

  it("falls back to the raw key when a group has no label left", async () => {
    const { auth } = await setup();
    mockLabels({});
    mockAggs({
      buckets: [
        {
          key: "agent_gone",
          doc_count: 1,
          credit_micro: { value: 1_000_000 },
          messages: { value: 1 },
        },
      ],
      totalMicro: 1_000_000,
    });

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.agents[0]).toMatchObject({
      agentId: "agent_gone",
      name: "agent_gone",
      pictureUrl: null,
      description: null,
    });
  });

  it("reports a zero average for a group with no counted unit", async () => {
    const { auth } = await setup();
    mockLabels({ agent1: "@dust" });
    mockAggs({
      buckets: [
        {
          key: "agent1",
          doc_count: 0,
          credit_micro: { value: 1_000_000 },
          messages: { value: 0 },
        },
      ],
      totalMicro: 1_000_000,
    });

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.agents[0].avgCreditsPerMessage).toBe(0);
  });

  it("still returns the ranking when the previous-period lookup fails", async () => {
    const { auth } = await setup();
    mockLabels({ agent1: "@dust" });
    // The ranking query succeeds, then the previous-period query fails.
    vi.mocked(searchConsumptionAnalytics).mockResolvedValueOnce(
      esResponse({
        by_group: {
          buckets: [
            {
              key: "agent1",
              doc_count: 1,
              credit_micro: { value: 3_000_000 },
              messages: { value: 1 },
            },
          ],
        },
        total_count: { value: 1 },
        total_credit_micro: { value: 3_000_000 },
      })
    );
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("connection_error", "boom"))
    );

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.agents[0].credits).toBe(3);
    expect(result.value.agents[0].previousCredits).toBeNull();
  });

  it("ranks ascending when sortOrder is asc", async () => {
    const { auth } = await setup();
    mockLabels({ agent1: "@dust" });
    mockAggs({
      buckets: [
        {
          key: "agent1",
          doc_count: 1,
          credit_micro: { value: 3_000_000 },
          messages: { value: 1 },
        },
      ],
      totalMicro: 3_000_000,
    });

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 10,
      sortOrder: "asc",
    });

    expect(result.isOk()).toBe(true);

    const [, options] = rankingSearchCall();
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      order: { credit_micro: "asc" },
    });
  });
});

describe("fetchConsumptionTopGroups options", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "credits sort on the credit sum",
      dimension: "agent" as const,
      rankBy: "credits" as const,
      order: { credit_micro: "desc" },
    },
    {
      name: "a message dimension counted sorts on distinct messages",
      dimension: "agent" as const,
      rankBy: "count" as const,
      order: { messages: "desc" },
    },
    {
      name: "an invocation dimension counted sorts on the bucket's own docs",
      dimension: "tool" as const,
      rankBy: "count" as const,
      order: { _count: "desc" },
    },
  ])("$name", async ({ dimension, rankBy, order }) => {
    const { auth } = await setup();
    mockAggs({ buckets: [], totalMicro: 0 });

    await fetchConsumptionTopGroupBuckets(auth, {
      dimension,
      period: PERIOD,
      limit: 5,
      rankBy,
      includePreviousCredits: false,
    });

    const [, options] = lastSearchCall();
    expect(options?.aggregations?.by_group?.terms).toMatchObject({ order });
  });

  it("skips the previous-period search when the caller opts out", async () => {
    const { auth } = await setup();
    mockAggs({
      buckets: [{ key: "a", credit_micro: { value: 1 } }],
      totalMicro: 1,
    });

    await fetchConsumptionTopGroupBuckets(auth, {
      dimension: "agent",
      period: PERIOD,
      limit: 5,
      includePreviousCredits: false,
    });

    expect(vi.mocked(searchConsumptionAnalytics)).toHaveBeenCalledTimes(1);
  });

  it("scopes on the tags filter key", async () => {
    const { auth } = await setup();
    mockAggs({ buckets: [], totalMicro: 0 });

    await fetchConsumptionTopGroupBuckets(auth, {
      dimension: "agent",
      period: PERIOD,
      limit: 5,
      filter: { tags: ["tag_1"] },
      includePreviousCredits: false,
    });

    const [query] = lastSearchCall();
    expect(query.bool?.filter).toContainEqual({
      term: { "agent.tag_ids": "tag_1" },
    });
  });
});

describe("resolveConsumptionGroupLabels", () => {
  it("drops a conversation row resolveDimensionLabels omitted, rather than falling back to its id", async () => {
    const { auth } = await setup();
    mockLabels({ readable_conversation: "Readable" });

    const rows = await resolveConsumptionGroupLabels(auth, "conversation", [
      {
        key: "private_conversation",
        credits: 12,
        count: 3,
        previousCredits: null,
      },
      {
        key: "readable_conversation",
        credits: 4,
        count: 1,
        previousCredits: null,
      },
    ]);

    expect(rows.map((row) => row.key)).toEqual(["readable_conversation"]);
  });

  it("falls back to the raw key for every other dimension", async () => {
    const { auth } = await setup();
    mockLabels({});

    const rows = await resolveConsumptionGroupLabels(auth, "model", [
      { key: "deleted-model", credits: 4, count: 1, previousCredits: null },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({ key: "deleted-model", name: "deleted-model" }),
    ]);
  });
});
