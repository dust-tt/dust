import {
  fetchMessageExportRows,
  MESSAGE_EXPORT_HEADERS,
} from "@app/lib/api/analytics/messages_export";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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
});
