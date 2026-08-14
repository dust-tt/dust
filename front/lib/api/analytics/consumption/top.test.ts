import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { fetchConsumptionTopAgents } from "@app/lib/api/analytics/consumption/top_agents";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top_groups";
import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";
import { fetchConsumptionTopSkills } from "@app/lib/api/analytics/consumption/top_skills";
import { fetchConsumptionTopSources } from "@app/lib/api/analytics/consumption/top_sources";
import { fetchConsumptionTopTools } from "@app/lib/api/analytics/consumption/top_tools";
import { fetchConsumptionTopUsers } from "@app/lib/api/analytics/consumption/top_users";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(
  import("@app/lib/api/analytics/consumption/facet_catalog"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, listConsumptionFacetCatalog: vi.fn() };
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
  filtered = false,
}: {
  buckets: unknown[];
  totalCount?: number;
  totalMicro: number;
  filtered?: boolean;
}) {
  const ranking = {
    by_group: { buckets },
    total_count: { value: totalCount },
  };
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    esResponse({
      ...(filtered ? { ranking } : ranking),
      total_credit_micro: { value: totalMicro },
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

// The last search the code under test issued, as [query, options].
function lastSearchCall() {
  const calls = vi.mocked(searchConsumptionAnalytics).mock.calls;
  return calls[calls.length - 1];
}

describe("consumption top rankings", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(listConsumptionFacetCatalog).mockReset();
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
        // The 7 documents of the bucket belong to 2 messages.
        messageCount: 2,
        avgCreditsPerMessage: 1.5,
      },
    ]);

    // Ranked on agent.id by gross credits, with a per-message cardinality
    // sub-agg — a message spans several documents.
    const [query, options] = lastSearchCall();
    expect(query.bool?.filter).toContainEqual({
      range: { completed_at: { gte: PERIOD.startDate, lt: PERIOD.endDate } },
    });
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "agent.id",
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
        {
          key: "agent1",
          doc_count: 1,
          credit_micro: { value: 4_000_000 },
          messages: { value: 1 },
        },
        {
          key: "agent2",
          doc_count: 1,
          credit_micro: { value: 3_000_000 },
          messages: { value: 1 },
        },
        {
          key: "agent3",
          doc_count: 1,
          credit_micro: { value: 2_000_000 },
          messages: { value: 1 },
        },
        {
          key: "agent4",
          doc_count: 1,
          credit_micro: { value: 1_000_000 },
          messages: { value: 1 },
        },
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

  it.each([
    ["AGENT 080", { terms: { "agent.id": ["agent80"] } }],
    ["missing", { match_none: {} }],
  ])("filters the ranking for search %s", async (search, expectedFilter) => {
    const { auth } = await setup();
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [
        { value: "agent80", label: "Pagination Agent 080", pictureUrl: null },
      ],
      user: [],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [],
    });
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
    expect(listConsumptionFacetCatalog).toHaveBeenCalledWith(auth);
    expect(lastSearchCall()[1]?.aggregations?.ranking?.filter).toEqual(
      expectedFilter
    );
  });

  it("splits broad searches into bounded terms clauses", async () => {
    const { auth } = await setup();
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: Array.from({ length: 65_537 }, (_, index) => ({
        value: `agent${index}`,
        label: "Agent",
        pictureUrl: null,
      })),
      user: [],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [],
    });
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
        {
          key: "web_search_browse",
          doc_count: 4,
          credit_micro: { value: 2_000_000 },
        },
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
    expect(options?.aggregations?.by_group?.aggs?.messages).toBeUndefined();
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
        },
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
      messageCount: 4,
      avgCreditsPerMessage: 1,
    });
    expect(lastSearchCall()[1]?.aggregations?.by_group?.terms).toMatchObject({
      field: "context_origin",
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
      term: { context_origin: "slack" },
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
});
