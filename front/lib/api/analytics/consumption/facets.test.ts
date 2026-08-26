import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { fetchConsumptionFacets } from "@app/lib/api/analytics/consumption/facets";
import type { DimensionLabel } from "@app/lib/api/analytics/consumption/labels";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

vi.mock(
  import("@app/lib/api/analytics/consumption/facet_catalog"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, listConsumptionFacetCatalog: vi.fn() };
  }
);

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

function esResponse(aggregations: Record<string, unknown>) {
  return new Ok({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: { value: 0, relation: "eq" as const },
      max_score: null,
      hits: [],
    },
    aggregations,
  });
}

describe("fetchConsumptionFacets", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(resolveDimensionLabels).mockReset();
    vi.mocked(listConsumptionFacetCatalog).mockReset();
  });

  it("merges current and historical values sorted by availability then label", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    vi.mocked(resolveDimensionLabels).mockImplementation(
      async (_auth, _dimension, values) =>
        new Map(
          values.map((value) => [
            value,
            {
              name: value === "agent_disabled" ? "Alpha" : "Zulu",
              pictureUrl: null,
              description: null,
            },
          ])
        )
    );
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [
        {
          value: "agent_never_used",
          label: "Beta",
          pictureUrl: null,
          scope: "visible",
        },
      ],
      user: [
        {
          value: "user_never_used",
          label: "Never Used",
          pictureUrl: null,
        },
      ],
      api_key: [
        {
          value: "Production key",
          label: "Production key",
          pictureUrl: null,
        },
      ],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [],
    });
    vi.mocked(searchConsumptionAnalytics).mockImplementation(
      async (_query, options) => {
        const composite = options?.aggregations?.values?.composite;
        const field = composite?.sources?.[0]?.value?.terms?.field;

        if (field === "agent.attributed_id" && composite?.after) {
          return esResponse({
            values: {
              buckets: [
                {
                  key: { value: "agent_disabled" },
                  doc_count: 4,
                  contextual: { doc_count: 0 },
                },
              ],
            },
          });
        }

        if (field === "agent.attributed_id") {
          return esResponse({
            values: {
              buckets: [
                {
                  key: { value: "agent_enabled" },
                  doc_count: 10,
                  contextual: { doc_count: 3 },
                },
              ],
              after_key: { value: "agent_enabled" },
            },
          });
        }

        return esResponse({
          values: {
            // All remaining dimensions are empty in this fixture.
            buckets: [],
          },
        });
      }
    );

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
      filter: {
        agents: ["agent_enabled"],
        users: ["user_1"],
        sources: ["slack"],
      },
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.facets.agent).toEqual([
      {
        value: "agent_enabled",
        label: "Zulu",
        pictureUrl: null,
        documentCount: 3,
        disabled: false,
      },
      {
        value: "agent_disabled",
        label: "Alpha",
        pictureUrl: null,
        documentCount: 0,
        disabled: true,
      },
      {
        value: "agent_never_used",
        label: "Beta",
        pictureUrl: null,
        documentCount: 0,
        disabled: true,
        scope: "visible",
      },
    ]);
    expect(result.value.facets.user).toEqual([
      {
        value: "user_never_used",
        label: "Never Used",
        pictureUrl: null,
        documentCount: 0,
        disabled: true,
      },
    ]);
    expect(result.value.facets.api_key).toEqual([
      {
        value: "Production key",
        label: "Production key",
        pictureUrl: null,
        documentCount: 0,
        disabled: true,
      },
    ]);

    const [query, options] = vi.mocked(searchConsumptionAnalytics).mock
      .calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          {
            term: {
              workspace_id: authenticator.getNonNullableWorkspace().sId,
            },
          },
          {
            range: {
              completed_at: {
                gte: PERIOD.startDate,
                lt: PERIOD.endDate,
              },
            },
          },
        ],
      },
    });
    expect(options?.size).toBe(0);
    expect(options?.aggregations?.values?.composite).toMatchObject({
      size: 1_000,
      sources: [{ value: { terms: { field: "agent.attributed_id" } } }],
    });

    const agentContext = options?.aggregations?.values?.aggs?.contextual;
    expect(agentContext?.filter?.bool?.filter).toContainEqual({
      term: { "user.id": "user_1" },
    });
    expect(agentContext?.filter?.bool?.filter).toContainEqual({
      term: { normalized_origin: "slack" },
    });
    expect(agentContext?.filter?.bool?.filter).not.toContainEqual({
      term: { "agent.attributed_id": "agent_enabled" },
    });

    const secondAgentCall = vi
      .mocked(searchConsumptionAnalytics)
      .mock.calls.find(
        ([, callOptions]) =>
          callOptions?.aggregations?.values?.composite?.after !== undefined
      );
    const secondAgentOptions = secondAgentCall?.[1];
    expect(secondAgentOptions?.aggregations?.values?.composite).toMatchObject({
      after: { value: "agent_enabled" },
    });

    const userCall = vi
      .mocked(searchConsumptionAnalytics)
      .mock.calls.find(
        ([, callOptions]) =>
          callOptions?.aggregations?.values?.composite?.sources?.[0]?.value
            ?.terms?.field === "user.id"
      );
    const userOptions = userCall?.[1];
    const userContext = userOptions?.aggregations?.values?.aggs?.contextual;
    expect(userContext?.filter?.bool?.filter).toContainEqual({
      term: { "agent.attributed_id": "agent_enabled" },
    });
    expect(userContext?.filter?.bool?.filter).not.toContainEqual({
      term: { "user.id": "user_1" },
    });

    const queriedFields = vi
      .mocked(searchConsumptionAnalytics)
      .mock.calls.map(
        ([, callOptions]) =>
          callOptions?.aggregations?.values?.composite?.sources?.[0]?.value
            ?.terms?.field
      );
    expect(queriedFields).toHaveLength(9);
    expect(new Set(queriedFields)).toEqual(
      new Set([
        "agent.attributed_id",
        "user.id",
        "api_key_name",
        "user.group_ids",
        "model.model_id",
        "tool.server_name",
        "tool.attributed_skill_ids",
        "normalized_origin",
      ])
    );
    expect(
      queriedFields.filter((field) => field === "agent.attributed_id")
    ).toHaveLength(2);
  });

  it("limits concurrent dimension queries", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [],
      user: [],
      api_key: [],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [],
    });

    let releaseQueries = () => {};
    const queryGate = new Promise<void>((resolve) => {
      releaseQueries = resolve;
    });
    vi.mocked(searchConsumptionAnalytics).mockImplementation(async () => {
      await queryGate;
      return esResponse({ values: { buckets: [] } });
    });

    const facetsPromise = fetchConsumptionFacets(authenticator, {
      period: PERIOD,
    });
    try {
      await vi.waitFor(() => {
        expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(6);
      });
    } finally {
      releaseQueries();
    }

    const result = await facetsPromise;
    expect(result.isOk()).toBe(true);
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(8);
  });

  it("restricts the automations scope to trigger-originated documents", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [],
      user: [],
      api_key: [],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [],
    });
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({ values: { buckets: [] } })
    );

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
      filter: { users: ["user_1"] },
      scope: "automations",
    });

    expect(result.isOk()).toBe(true);

    const triggerExists = { exists: { field: "trigger_id" } };
    for (const [query, options] of vi.mocked(searchConsumptionAnalytics).mock
      .calls) {
      // Both the value enumeration and the availability count must be scoped.
      expect(query.bool?.filter).toContainEqual(triggerExists);
      expect(
        options?.aggregations?.values?.aggs?.contextual?.filter?.bool?.filter
      ).toContainEqual(triggerExists);
    }
  });

  it("leaves documents unscoped by default", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [],
      user: [],
      api_key: [],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [],
    });
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({ values: { buckets: [] } })
    );

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
    });

    expect(result.isOk()).toBe(true);
    for (const [query] of vi.mocked(searchConsumptionAnalytics).mock.calls) {
      expect(query.bool?.filter).not.toContainEqual({
        exists: { field: "trigger_id" },
      });
    }
  });

  it("sweeps and resolves only the requested dimensions", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [{ value: "agent-1", label: "Agent one", pictureUrl: null }],
      user: [{ value: "user-1", label: "User one", pictureUrl: null }],
      api_key: [],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [],
    });
    vi.mocked(resolveDimensionLabels).mockResolvedValue(new Map());
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({ values: { buckets: [] } })
    );

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
      dimensions: ["agent", "user"],
    });

    expect(result.isOk()).toBe(true);
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(2);
    expect(listConsumptionFacetCatalog).toHaveBeenCalledWith(authenticator, [
      "agent",
      "user",
    ]);

    const sweptFields = vi
      .mocked(searchConsumptionAnalytics)
      .mock.calls.map(
        ([, options]) =>
          options?.aggregations?.values?.composite?.sources?.[0]?.value?.terms
            ?.field
      );
    expect(sweptFields.sort()).toEqual(["agent.attributed_id", "user.id"]);

    if (result.isOk()) {
      expect(result.value.facets.agent).toHaveLength(1);
      expect(result.value.facets.user).toHaveLength(1);
      expect(result.value.facets.model).toEqual([]);
      expect(result.value.facets.tool).toEqual([]);
    }
  });

  it("keeps personal facets bucket-scoped and preserves their metadata", async () => {
    const { authenticator, user } = await createResourceTest({ role: "user" });
    const valuesByField: Record<string, string> = {
      "agent.attributed_id": "used-agent",
      "model.model_id": "used-model",
      "tool.server_name": "used-tool",
      "tool.attributed_skill_ids": "used-skill",
    };
    vi.mocked(searchConsumptionAnalytics).mockImplementation(
      async (_query, options) => {
        const field =
          options?.aggregations?.values?.composite?.sources?.[0]?.value?.terms
            ?.field;
        const value = field ? valuesByField[field] : undefined;
        return esResponse({
          values: {
            buckets: value
              ? [{ key: { value }, contextual: { doc_count: 1 } }]
              : [],
          },
        });
      }
    );
    const labels: Partial<Record<ConsumptionScopeDimension, DimensionLabel>> = {
      agent: {
        name: "Used agent",
        pictureUrl: null,
        description: null,
        scope: "visible",
      },
      model: {
        name: "Used model",
        pictureUrl: null,
        description: null,
        maker: "openai",
        tier: "balanced",
      },
      tool: {
        name: "Used tool",
        pictureUrl: null,
        description: null,
        icon: "tool-icon",
      },
      skill: {
        name: "Used skill",
        pictureUrl: null,
        description: null,
        icon: "skill-icon",
      },
    };
    vi.mocked(resolveDimensionLabels).mockImplementation(
      async (_auth, dimension, values) => {
        const label = labels[dimension];
        return new Map(label ? values.map((value) => [value, label]) : []);
      }
    );

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
      userId: user.sId,
      dimensions: ["agent", "model", "tool", "skill"],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(listConsumptionFacetCatalog).not.toHaveBeenCalled();
    expect(result.value.facets.agent).toEqual([
      expect.objectContaining({ value: "used-agent", scope: "visible" }),
    ]);
    expect(result.value.facets.model).toEqual([
      expect.objectContaining({
        value: "used-model",
        maker: "openai",
        tier: "balanced",
      }),
    ]);
    expect(result.value.facets.tool).toEqual([
      expect.objectContaining({ value: "used-tool", icon: "tool-icon" }),
    ]);
    expect(result.value.facets.skill).toEqual([
      expect.objectContaining({ value: "used-skill", icon: "skill-icon" }),
    ]);

    for (const [query] of vi.mocked(searchConsumptionAnalytics).mock.calls) {
      expect(query.bool?.filter).toContainEqual({
        term: { "user.id": user.sId },
      });
    }
  });

  it("keeps agent facets bucket-scoped and preserves their metadata", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [],
      user: [],
      api_key: [],
      group: [],
      model: [
        {
          value: "unrelated-model",
          label: "Unrelated model",
          pictureUrl: null,
        },
      ],
      tool: [],
      skill: [],
      source: [],
    });
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        values: {
          buckets: [
            {
              key: { value: "used-model" },
              contextual: { doc_count: 1 },
            },
          ],
        },
      })
    );
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "used-model",
          {
            name: "Used model",
            pictureUrl: null,
            description: null,
            maker: "anthropic",
            tier: "premium",
          },
        ],
      ])
    );

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
      agentId: "agent_1",
      dimensions: ["model"],
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.facets.model).toEqual([
      expect.objectContaining({
        value: "used-model",
        maker: "anthropic",
        tier: "premium",
      }),
    ]);
    expect(listConsumptionFacetCatalog).not.toHaveBeenCalled();

    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query.bool?.filter).toContainEqual({
      term: { "agent.attributed_id": "agent_1" },
    });
  });

  it("returns the Elasticsearch failure before resolving historical labels", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    const error = new ElasticsearchError("query_error", "query failed");
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(new Err(error));

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
    });

    expect(result).toEqual(new Err(error));
    expect(listConsumptionFacetCatalog).not.toHaveBeenCalled();
    expect(resolveDimensionLabels).not.toHaveBeenCalled();
  });
});
