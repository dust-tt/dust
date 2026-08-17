import { listConsumptionFacetCatalogDimension } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { previousConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { fetchConsumptionTopAgents } from "@app/lib/api/analytics/consumption/top_agents";
import { fetchConsumptionTopApiKeys } from "@app/lib/api/analytics/consumption/top_api_keys";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top_groups";
import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";
import { fetchConsumptionTopSkills } from "@app/lib/api/analytics/consumption/top_skills";
import { fetchConsumptionTopSources } from "@app/lib/api/analytics/consumption/top_sources";
import { fetchConsumptionTopTools } from "@app/lib/api/analytics/consumption/top_tools";
import { fetchConsumptionTopUsers } from "@app/lib/api/analytics/consumption/top_users";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
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

// The query is a single request spanning both periods (see
// fetchConsumptionTopGroups), so tests that assert on the date range need
// this to build the expected union bound.
const PREVIOUS_PERIOD = previousConsumptionPeriod(PERIOD);

function esResponse(aggregations: unknown) {
  return new Ok({ aggregations }) as Awaited<
    ReturnType<typeof searchConsumptionAnalytics>
  >;
}

// A ranked bucket, with its current- and previous-period nested filter aggs.
// `previousCreditMicro` defaults to `creditMicro` so growth reads as flat,
// matching what most tests want; pass `previousDocCount: 0` for "no prior
// consumption at all" (null vs-prev).
function bucket({
  key,
  docCount,
  creditMicro,
  messages,
  previousCreditMicro = creditMicro,
  previousDocCount = docCount,
}: {
  key: string;
  docCount: number;
  creditMicro: number;
  messages?: number;
  previousCreditMicro?: number;
  previousDocCount?: number;
}) {
  return {
    key,
    current_period: {
      doc_count: docCount,
      credit_micro: { value: creditMicro },
      ...(messages !== undefined ? { messages: { value: messages } } : {}),
    },
    previous_period: {
      doc_count: previousDocCount,
      credit_micro: { value: previousCreditMicro },
    },
  };
}

function mockAggs({
  buckets,
  totalCount = buckets.length,
  totalMicro,
  filtered = false,
}: {
  buckets: unknown[];
  totalCount?: number;
  totalMicro: number;
  filtered?: boolean;
}) {
  const ranking = {
    by_group: { buckets },
    total_count: { count: { value: totalCount } },
  };
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    esResponse({
      ...(filtered ? { ranking } : ranking),
      total_credit_micro: { value: { value: totalMicro } },
    })
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

// The last search the code under test issued — one call per fetch, since the
// ranking and the vs-prev credits now share a single Elasticsearch request.
function lastSearchCall() {
  const calls = vi.mocked(searchConsumptionAnalytics).mock.calls;
  return calls[calls.length - 1];
}

describe("consumption top rankings", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(listConsumptionFacetCatalogDimension).mockReset();
    vi.mocked(resolveDimensionLabels).mockReset();
  });

  it("ranks agents on gross credits and averages over distinct messages, in a single request", async () => {
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
        bucket({
          key: "agent1",
          docCount: 7,
          creditMicro: 3_000_000,
          messages: 2,
        }),
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
        // The mocked bucket reuses the current period's credits for the
        // previous one, so growth comes out flat.
        previousCredits: 3,
        // The 7 documents of the bucket belong to 2 messages.
        messageCount: 2,
        avgCreditsPerMessage: 1.5,
      },
    ]);

    // A single call: the query spans the union of both periods, and the
    // ranking/vs-prev split happens through nested filter aggregations.
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    const [query, options] = lastSearchCall();
    expect(query.bool?.filter).toContainEqual({
      range: {
        completed_at: { gte: PREVIOUS_PERIOD.startDate, lt: PERIOD.endDate },
      },
    });

    // Ranked on agent.id by current-period gross credits, with a per-message
    // cardinality sub-agg — a message spans several documents.
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "agent.id",
      size: 10,
      order: { "current_period>credit_micro": "desc" },
    });
    const byGroupAggs = options?.aggregations?.by_group?.aggs;
    expect(byGroupAggs?.current_period?.filter).toEqual({
      range: { completed_at: { gte: PERIOD.startDate, lt: PERIOD.endDate } },
    });
    expect(byGroupAggs?.current_period?.aggs?.credit_micro?.sum?.field).toBe(
      "credit_micro"
    );
    expect(
      byGroupAggs?.current_period?.aggs?.messages?.cardinality?.field
    ).toBe("agent_message_id");
    expect(byGroupAggs?.previous_period?.filter).toEqual({
      range: {
        completed_at: {
          gte: PREVIOUS_PERIOD.startDate,
          lt: PREVIOUS_PERIOD.endDate,
        },
      },
    });
    expect(byGroupAggs?.previous_period?.aggs?.credit_micro?.sum?.field).toBe(
      "credit_micro"
    );

    expect(options?.aggregations?.total_credit_micro?.filter).toEqual({
      range: { completed_at: { gte: PERIOD.startDate, lt: PERIOD.endDate } },
    });
    expect(
      options?.aggregations?.total_credit_micro?.aggs?.value?.sum?.field
    ).toBe("credit_micro");
    expect(options?.aggregations?.total_count?.filter).toEqual({
      range: { completed_at: { gte: PERIOD.startDate, lt: PERIOD.endDate } },
    });
    expect(
      options?.aggregations?.total_count?.aggs?.count?.cardinality
    ).toEqual({
      field: "agent.id",
      precision_threshold: 40_000,
    });
    expect(options?.aggregations?.ranking).toBeUndefined();
  });

  it("returns one ranked page with the total number of groups", async () => {
    const { auth } = await setup();
    mockLabels({ agent2: "Agent 2", agent3: "Agent 3" });
    mockAggs({
      buckets: [
        bucket({
          key: "agent1",
          docCount: 1,
          creditMicro: 4_000_000,
          messages: 1,
        }),
        bucket({
          key: "agent2",
          docCount: 1,
          creditMicro: 3_000_000,
          messages: 1,
        }),
        bucket({
          key: "agent3",
          docCount: 1,
          creditMicro: 2_000_000,
          messages: 1,
        }),
        bucket({
          key: "agent4",
          docCount: 1,
          creditMicro: 1_000_000,
          messages: 1,
        }),
      ],
      totalMicro: 10_000_000,
    });

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 2,
      offset: 1,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.agents.map((agent) => agent.agentId)).toEqual([
      "agent2",
      "agent3",
    ]);
    expect(result.value.hasMore).toBe(true);
    expect(result.value.totalCount).toBe(4);
    expect(lastSearchCall()[1]?.aggregations?.by_group?.terms).toMatchObject({
      size: 3,
    });
  });

  it("drops candidate buckets with no current-period activity", async () => {
    const { auth } = await setup();
    mockLabels({ agent1: "Agent 1" });
    mockAggs({
      buckets: [
        bucket({
          key: "agent1",
          docCount: 1,
          creditMicro: 1_000_000,
          messages: 1,
        }),
        // Only ever active in the previous period: a terms candidate the
        // union-range query surfaces, but it must not show up in the ranking.
        bucket({
          key: "agent_stale",
          docCount: 0,
          creditMicro: 0,
          previousCreditMicro: 5_000_000,
          previousDocCount: 3,
        }),
      ],
      totalCount: 1,
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
    expect(result.value.agents.map((agent) => agent.agentId)).toEqual([
      "agent1",
    ]);
  });

  it.each([
    ["AGENT 080", { terms: { "agent.id": ["agent80"] } }],
    ["missing", { match_none: {} }],
  ])("filters the ranking for search %s", async (search, expectedFilter) => {
    const { auth } = await setup();
    vi.mocked(listConsumptionFacetCatalogDimension).mockResolvedValue([
      { value: "agent80", label: "Pagination Agent 080", pictureUrl: null },
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
    expect(termsClauses[0]?.terms?.["agent.id"]).toHaveLength(65_536);
    expect(termsClauses[1]?.terms?.["agent.id"]).toHaveLength(1);
  });

  it("counts tool invocations as documents, with no message sub-agg", async () => {
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
        bucket({
          key: "web_search_browse",
          docCount: 4,
          creditMicro: 2_000_000,
        }),
      ],
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
    // The tools are a slice of the period, not all of it.
    expect(result.value.totalCredits).toBe(10);

    const [, options] = lastSearchCall();
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "tool.server_name",
    });
    expect(
      options?.aggregations?.by_group?.aggs?.current_period?.aggs?.messages
    ).toBeUndefined();
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
        bucket({
          key: "Production key",
          docCount: 6,
          creditMicro: 3_000_000,
          messages: 2,
        }),
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
        previousCredits: 3,
        messageCount: 2,
        avgCreditsPerMessage: 1.5,
      },
    ]);

    const [, options] = lastSearchCall();
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
      options?.aggregations?.ranking?.aggs?.by_group?.aggs?.current_period?.aggs
        ?.messages?.cardinality?.field
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
      buckets: [bucket({ key: "skl_1", docCount: 5, creditMicro: 2_500_000 })],
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
    expect(
      options?.aggregations?.by_group?.aggs?.current_period?.aggs?.messages
    ).toBeUndefined();
  });

  it("ranks users, groups and models per message on their own key", async () => {
    const { auth } = await setup();
    mockAggs({
      buckets: [
        bucket({
          key: "key1",
          docCount: 6,
          creditMicro: 2_000_000,
          messages: 4,
        }),
      ],
      totalMicro: 2_000_000,
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

    mockLabels({ key1: "Engineering" });
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
      previousCredits: 2,
      messageCount: 4,
      avgCreditsPerMessage: 0.5,
    });
    expect(lastSearchCall()[1]?.aggregations?.by_group?.terms).toMatchObject({
      field: "user.group_ids",
    });

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

  it("keys sources on the raw context origin so the row can be filtered on", async () => {
    const { auth } = await setup();
    mockLabels({ web: "Conversation" });
    mockAggs({
      buckets: [
        bucket({
          key: "web",
          docCount: 10,
          creditMicro: 4_000_000,
          messages: 4,
        }),
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
        bucket({
          key: "agent_gone",
          docCount: 1,
          creditMicro: 1_000_000,
          messages: 1,
        }),
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
        bucket({
          key: "agent1",
          docCount: 1,
          creditMicro: 1_000_000,
          messages: 0,
        }),
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

  it("reports null vs-prev growth for a group with no prior consumption", async () => {
    const { auth } = await setup();
    mockLabels({ agent1: "@dust" });
    mockAggs({
      buckets: [
        bucket({
          key: "agent1",
          docCount: 1,
          creditMicro: 3_000_000,
          messages: 1,
          previousDocCount: 0,
          previousCreditMicro: 0,
        }),
      ],
      totalMicro: 3_000_000,
    });

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

  it("fails the ranking when the merged Elasticsearch request errors", async () => {
    const { auth } = await setup();
    mockLabels({ agent1: "@dust" });
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("connection_error", "boom"))
    );

    const result = await fetchConsumptionTopAgents(auth, {
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(false);
  });
});
