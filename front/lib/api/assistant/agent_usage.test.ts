import { Ok } from "@dust-tt/types";
import { describe, expect, it, vi } from "vitest";

import { agentMentionsCount } from "@app/lib/api/assistant/agent_usage";

vi.mock("@app/lib/api/elasticsearch", () => ({
  searchAnalytics: vi.fn(),
}));

import { searchAnalytics } from "@app/lib/api/elasticsearch";

describe("agentMentionsCount", () => {
  it("should return aggregated mentions from Elasticsearch", async () => {
    const mockSearchAnalytics = vi.mocked(searchAnalytics);
    mockSearchAnalytics.mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: {
          by_agent: {
            buckets: [
              {
                key: "agent-123",
                doc_count: 5,
                conversation_count: { value: 3 },
                user_count: { value: 2 },
              },
              {
                key: "agent-456",
                doc_count: 2,
                conversation_count: { value: 1 },
                user_count: { value: 1 },
              },
            ],
          },
        },
      })
    );

    const result = await agentMentionsCount("workspace-sId");

    expect(result).toHaveLength(2);
    expect(result[0].agentId).toBe("agent-123");
    expect(result[0].messageCount).toBe(5);
    expect(result[0].conversationCount).toBe(3);
    expect(result[0].userCount).toBe(2);
    expect(result[1].agentId).toBe("agent-456");
    expect(result[1].messageCount).toBe(2);

    // Verify the query structure
    expect(mockSearchAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        bool: {
          filter: expect.arrayContaining([
            { term: { workspace_id: "workspace-sId" } },
            { exists: { field: "agent_id" } },
          ]),
        },
      }),
      expect.objectContaining({
        aggregations: expect.any(Object),
        size: 0,
      })
    );
  });

  it("should return empty array when no aggregations", async () => {
    const mockSearchAnalytics = vi.mocked(searchAnalytics);
    mockSearchAnalytics.mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: {
          by_agent: {
            buckets: [],
          },
        },
      })
    );

    const result = await agentMentionsCount("workspace-sId");

    expect(result).toHaveLength(0);
  });
});
