import { buildConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { fetchConsumptionTop } from "@app/lib/api/analytics/consumption/top";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import { resolveServerDisplayNames } from "@app/lib/api/assistant/observability/tool_usage";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(
  import("@app/lib/api/assistant/observability/agent_labels"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, resolveAnalyticsAgentLabels: vi.fn() };
  }
);

vi.mock(
  import("@app/lib/api/assistant/observability/tool_usage"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, resolveServerDisplayNames: vi.fn() };
  }
);

const PERIOD = buildConsumptionPeriod({
  kind: "cycle",
  cycleStartMs: Date.UTC(2026, 6, 1),
  cycleEndMs: Date.UTC(2026, 7, 1),
  nowMs: Date.UTC(2026, 6, 13),
});

function esResponse(aggregations: unknown) {
  return new Ok({ aggregations }) as Awaited<
    ReturnType<typeof searchConsumptionAnalytics>
  >;
}

function mockAggs({
  buckets,
  totalMicro,
}: {
  buckets: unknown[];
  totalMicro: number;
}) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    esResponse({
      by_group: { buckets },
      total_credit_micro: { value: totalMicro },
    })
  );
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth };
}

describe("fetchConsumptionTop", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(resolveAnalyticsAgentLabels).mockReset();
    vi.mocked(resolveServerDisplayNames).mockReset();
  });

  it("ranks agents by credits and averages over distinct messages", async () => {
    const { auth } = await setup();
    vi.mocked(resolveAnalyticsAgentLabels).mockResolvedValue(
      new Map([
        [
          "agent1",
          {
            name: "@dust",
            pictureUrl: "http://pic/dust",
            modelDisplayName: "Claude",
            description: "",
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

    const result = await fetchConsumptionTop(auth, {
      dimension: "agent",
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.unit).toBe("message");
    expect(result.value.totalCredits).toBe(5);
    expect(result.value.rows).toEqual([
      {
        id: "agent1",
        name: "@dust",
        pictureUrl: "http://pic/dust",
        credits: 3,
        count: 2,
        // 3 credits over 2 messages.
        avgCreditPerUnit: 1.5,
      },
    ]);

    // Ranked on agent.id by credits, with a per-message cardinality sub-agg.
    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "agent.id",
      size: 10,
      order: { credit_micro: "desc" },
    });
    expect(
      options?.aggregations?.by_group?.aggs?.messages?.cardinality?.field
    ).toBe("agent_message_id");
    // Message-scoped dimensions rank on the billed amount.
    expect(
      options?.aggregations?.by_group?.aggs?.credit_micro?.sum?.field
    ).toBe("credit_micro");
  });

  it("counts tool calls as documents and restricts to tool documents", async () => {
    const { auth } = await setup();
    vi.mocked(resolveServerDisplayNames).mockResolvedValue(
      new Map([["web_search_&_browse", "Web Search & Browse"]])
    );
    mockAggs({
      buckets: [
        {
          key: "web_search_&_browse",
          doc_count: 4,
          credit_micro: { value: 2_000_000 },
        },
      ],
      totalMicro: 2_000_000,
    });

    const result = await fetchConsumptionTop(auth, {
      dimension: "tool",
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.unit).toBe("tool_call");
    expect(result.value.rows).toEqual([
      {
        id: "web_search_&_browse",
        name: "Web Search & Browse",
        pictureUrl: null,
        credits: 2,
        // 4 tool-call documents, not a message cardinality.
        count: 4,
        avgCreditPerUnit: 0.5,
      },
    ]);

    // The scope carries the tool-only filter, and there is no message sub-agg.
    const [query, options] = vi.mocked(searchConsumptionAnalytics).mock
      .calls[0];
    expect(query.bool?.filter).toContainEqual({
      term: { consumption_type: "tool" },
    });
    expect(options?.aggregations?.by_group?.aggs?.messages).toBeUndefined();
    // Tools rank on gross credits — billed credit is reconciled out of the tool
    // document, leaving only its direct charge.
    expect(
      options?.aggregations?.by_group?.aggs?.credit_micro?.sum?.field
    ).toBe("gross_credit_micro.total");
    expect(options?.aggregations?.total_credit_micro?.sum?.field).toBe(
      "gross_credit_micro.total"
    );
  });

  it("captures the provider to name a model, falling back to the id", async () => {
    const { auth } = await setup();
    mockAggs({
      buckets: [
        {
          key: "made-up-model",
          doc_count: 3,
          credit_micro: { value: 1_000_000 },
          messages: { value: 1 },
          provider: { buckets: [{ key: "anthropic" }] },
        },
      ],
      totalMicro: 1_000_000,
    });

    const result = await fetchConsumptionTop(auth, {
      dimension: "model",
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    // Unknown model id passes through unchanged.
    expect(result.value.rows[0].name).toBe("made-up-model");

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations?.by_group?.terms).toMatchObject({
      field: "model.model_id",
    });
    expect(options?.aggregations?.by_group?.aggs?.provider?.terms?.field).toBe(
      "model.provider_id"
    );
  });

  it("labels sources from the context origin without an extra query", async () => {
    const { auth } = await setup();
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

    const result = await fetchConsumptionTop(auth, {
      dimension: "source",
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.rows[0]).toMatchObject({
      id: "web",
      name: "Conversation",
      count: 4,
      avgCreditPerUnit: 1,
    });
  });

  it("resolves user display names and pictures", async () => {
    const { auth } = await setup();
    vi.spyOn(UserResource, "fetchByIds").mockResolvedValue([
      {
        sId: "user1",
        imageUrl: "http://pic/jane",
        fullName: () => "Jane Doe",
      } as unknown as UserResource,
    ]);
    mockAggs({
      buckets: [
        {
          key: "user1",
          doc_count: 6,
          credit_micro: { value: 2_000_000 },
          messages: { value: 4 },
        },
      ],
      totalMicro: 2_000_000,
    });

    const result = await fetchConsumptionTop(auth, {
      dimension: "user",
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.rows[0]).toMatchObject({
      id: "user1",
      name: "Jane Doe",
      pictureUrl: "http://pic/jane",
      avgCreditPerUnit: 0.5,
    });
  });

  it("reports a zero average for a group with no counted units", async () => {
    const { auth } = await setup();
    vi.mocked(resolveAnalyticsAgentLabels).mockResolvedValue(new Map());
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

    const result = await fetchConsumptionTop(auth, {
      dimension: "agent",
      period: PERIOD,
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.rows[0].avgCreditPerUnit).toBe(0);
  });
});
