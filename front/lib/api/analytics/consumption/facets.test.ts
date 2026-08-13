import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { fetchConsumptionFacets } from "@app/lib/api/analytics/consumption/facets";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
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

  it("merges current and historical values with contextual availability", async () => {
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

        if (field === "agent.id" && composite?.after) {
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

        if (field === "agent.id") {
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
      {
        value: "agent_enabled",
        label: "Zulu",
        pictureUrl: null,
        documentCount: 3,
        disabled: false,
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
      sources: [{ value: { terms: { field: "agent.id" } } }],
    });

    const agentContext = options?.aggregations?.values?.aggs?.contextual;
    expect(agentContext?.filter?.bool?.filter).toContainEqual({
      term: { "user.id": "user_1" },
    });
    expect(agentContext?.filter?.bool?.filter).toContainEqual({
      terms: { context_origin: ["slack", "slack_workflow"] },
    });
    expect(agentContext?.filter?.bool?.filter).not.toContainEqual({
      term: { "agent.id": "agent_enabled" },
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
      term: { "agent.id": "agent_enabled" },
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
        "agent.id",
        "user.id",
        "api_key_name",
        "user.group_ids",
        "model.model_id",
        "tool.server_name",
        "tool.attributed_skill_ids",
        "context_origin",
      ])
    );
    expect(queriedFields.filter((field) => field === "agent.id")).toHaveLength(
      2
    );
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

  it("offers one source facet per surface, counting its programmatic origin", async () => {
    const { authenticator } = await createResourceTest({ role: "manager" });
    vi.mocked(resolveDimensionLabels).mockResolvedValue(new Map());
    vi.mocked(listConsumptionFacetCatalog).mockResolvedValue({
      agent: [],
      user: [],
      group: [],
      model: [],
      tool: [],
      skill: [],
      source: [{ value: "cli", label: "CLI", pictureUrl: null }],
    });
    // Every dimension gets the same buckets back; only source is asserted on.
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        values: {
          buckets: [
            {
              key: { value: "cli" },
              doc_count: 4,
              contextual: { doc_count: 2 },
            },
            {
              key: { value: "cli_programmatic" },
              doc_count: 6,
              contextual: { doc_count: 3 },
            },
          ],
        },
      })
    );

    const result = await fetchConsumptionFacets(authenticator, {
      period: PERIOD,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.facets.source).toEqual([
      {
        value: "cli",
        label: "CLI",
        pictureUrl: null,
        documentCount: 5,
        disabled: false,
      },
    ]);
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
