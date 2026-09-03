import { fetchMessageExportRows } from "@app/lib/api/analytics/messages_export";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

describe("fetchMessageExportRows (consumption index)", () => {
  it("maps a composite aggregation response to MessageExportRow fields", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const [tagZeta, tagAlpha] = await Promise.all([
      TagFactory.create(workspace, { name: "Zeta" }),
      TagFactory.create(workspace, { name: "Alpha" }),
    ]);

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: {
          total: { value: 0, relation: "eq" as const },
          hits: [] as estypes.SearchHit<ElasticsearchBaseDocument>[],
        },
        aggregations: {
          by_message: {
            buckets: [
              {
                key: { agent_message_id: "msg_42" },
                doc_count: 3,
                min_completed_at: {
                  value_as_string: "2026-07-01T14:30:00.000Z",
                },
                agent_id: {
                  buckets: [{ key: "agent_abc", doc_count: 3 }],
                },
                agent_tag_ids: {
                  buckets: [
                    { key: tagZeta.sId, doc_count: 3 },
                    { key: tagAlpha.sId, doc_count: 3 },
                  ],
                },
                conversation_id: {
                  buckets: [{ key: "conv_xyz", doc_count: 3 }],
                },
                parent_message_id: {
                  buckets: [{ key: "msg_parent", doc_count: 3 }],
                },
                user_id: {
                  buckets: [{ key: "user_99", doc_count: 3 }],
                },
                context_origin: {
                  buckets: [{ key: "slack", doc_count: 3 }],
                },
                total_credit_micro: { value: 7 * MICRO_CREDITS_PER_CREDIT },
                tools: {
                  doc_count: 2,
                  unique_tools: {
                    buckets: [
                      {
                        key: ["server_a", "tool_search"],
                        key_as_string: "server_a|tool_search",
                        doc_count: 1,
                      },
                      {
                        key: ["server_b", "tool_create"],
                        key_as_string: "server_b|tool_create",
                        doc_count: 1,
                      },
                    ],
                  },
                },
                skills: {
                  buckets: [
                    { key: "skill_code", doc_count: 2 },
                    { key: "skill_data", doc_count: 1 },
                  ],
                },
                models: {
                  buckets: [
                    {
                      key: ["claude-opus-5", "anthropic", "agent", "medium"],
                      key_as_string: "claude-opus-5|anthropic|agent|medium",
                      doc_count: 3,
                    },
                  ],
                },
              },
            ],
          },
        },
      })
    );

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
      timezone: "UTC",
      useConsumptionIndex: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toHaveLength(1);
    const row = result.value[0];

    expect(row.messageId).toBe("msg_42");
    expect(row.createdAt).toBe("2026-07-01 14:30:00");
    expect(row.assistantId).toBe("agent_abc");
    expect(row.assistantTags).toBe("Alpha,Zeta");
    expect(row.conversationId).toBe("conv_xyz");
    expect(row.parentMessageId).toBe(""); // not yet implemented
    expect(row.userId).toBe("user_99");
    expect(row.source).toBe("slack");
    expect(row.toolsUsed).toContain("tool_search");
    expect(row.toolsUsed).toContain("tool_create");
    expect(row.skillsUsed).toBe("skill_code,skill_data");
    expect(row.modelId).toBe("claude-opus-5");
    expect(row.modelProviderId).toBe("anthropic");
    expect(row.modelResolutionMethod).toBe("agent");
    expect(row.credits).toBe(7);
  });
});
