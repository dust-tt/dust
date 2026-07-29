import { fetchMessageExportRows } from "@app/lib/api/analytics/messages_export";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

// Keep everything real; only stub the Elasticsearch query so the test does not
// depend on a live cluster.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchAnalytics: vi.fn() };
});

// The export reads from the read replica; in tests there is no replica so point
// it at the primary test connection.
vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

function mockMessageHits(docs: ElasticsearchBaseDocument[]) {
  vi.mocked(searchAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: docs.length, relation: "eq" },
        hits: docs.map((doc) => ({ _index: "test", _source: doc })),
      },
    })
  );
}

function messageDoc(
  overrides: Record<string, unknown> = {}
): ElasticsearchBaseDocument {
  return {
    workspace_id: "w_test",
    message_id: "msg_1",
    timestamp: "2026-07-01T12:00:00.000Z",
    agent_id: "agent_1",
    conversation_id: "conv_1",
    user_id: "user_1",
    context_origin: "web",
    status: "succeeded",
    ...overrides,
  };
}

describe("fetchMessageExportRows", () => {
  it("correctly reports credits column", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockMessageHits([
      messageDoc({ cost: { full_awu: 7, llm_awu: 4, tool_awu: 3 } }),
    ]);

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].credits).toBe(7);
  });

  it("resolves agent_tag_ids to sorted, distinct tag names in the assistantTags column", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const [zeta, alpha] = await Promise.all([
      TagFactory.create(workspace, { name: "Zeta" }),
      TagFactory.create(workspace, { name: "Alpha" }),
    ]);

    mockMessageHits([
      messageDoc({ agent_tag_ids: [zeta.sId, alpha.sId, "tag_unknown"] }),
    ]);

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    // Sorted, distinct, and unknown ids dropped.
    expect(result.value[0].assistantTags).toBe("Alpha,Zeta");
  });

  it("leaves assistantTags empty for docs indexed before agent_tag_ids shipped", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockMessageHits([messageDoc()]);

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value[0].assistantTags).toBe("");
  });

  it("defaults credits to 0 for docs indexed before the cost fields shipped", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockMessageHits([messageDoc()]);

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value[0].credits).toBe(0);
  });

  it("reports the resolved model columns", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockMessageHits([
      messageDoc({
        model: {
          provider_id: "anthropic",
          model_id: "claude-opus-5",
          reasoning_effort: "medium",
          resolution_method: "agent",
        },
      }),
    ]);

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value[0].modelId).toBe("claude-opus-5");
    expect(result.value[0].modelProviderId).toBe("anthropic");
    expect(result.value[0].modelResolutionMethod).toBe("agent");
  });

  it("leaves the model columns empty for docs indexed before the model fields shipped", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockMessageHits([messageDoc()]);

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value[0].modelId).toBe("");
    expect(result.value[0].modelProviderId).toBe("");
    expect(result.value[0].modelResolutionMethod).toBe("");
  });

  it("reports the direct parent in parentMessageId and defaults to empty", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockMessageHits([
      messageDoc({
        message_id: "msg_child",
        ancestor_message_ids: ["msg_parent"],
      }),
      messageDoc({ message_id: "msg_root" }),
    ]);

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toHaveLength(2);
    expect(result.value[0].parentMessageId).toBe("msg_parent");
    expect(result.value[1].parentMessageId).toBe("");
  });
});
