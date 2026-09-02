import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { TOOLS } from "@app/lib/api/actions/servers/user_analytics";
import { MIN_USERS_FOR_ANONYMITY } from "@app/lib/api/assistant/observability/anonymity";
import {
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    searchAnalytics: vi.fn(),
    searchConsumptionAnalytics: vi.fn(),
  };
});

const SHARDS = { total: 1, successful: 1, skipped: 0, failed: 0 };

function getToolByName(name: "get_personal_usage" | "get_workspace_activity") {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

function createTestExtra(auth: Authenticator): ToolHandlerExtra {
  return {
    auth,
    requestId: "user-analytics-test",
    // @ts-expect-error These query tests do not require an agent run context.
    runContext: undefined,
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };
}

function mockConsumptionRankings({
  activeUserCount = 0,
}: {
  activeUserCount?: number;
} = {}) {
  vi.mocked(searchConsumptionAnalytics).mockImplementation(
    async (_query, options) => {
      const field = options?.aggregations?.by_group?.terms?.field;
      const buckets =
        field === "user.id"
          ? Array.from({ length: activeUserCount }, (_, index) => ({
              key: `user-${index}`,
              doc_count: 1,
              credit_micro: { value: 1 },
              messages: { value: 1 },
            }))
          : [];

      return new Ok({
        took: 1,
        timed_out: false,
        _shards: SHARDS,
        hits: { total: { value: 0, relation: "eq" as const }, hits: [] },
        aggregations: {
          by_group: { buckets },
          total_credit_micro: { value: 0 },
        },
      });
    }
  );
}

describe("user_analytics tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads personal usage rankings from consumption analytics", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    mockConsumptionRankings();

    const result = await getToolByName("get_personal_usage").handler(
      {
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        timezone: "UTC",
      },
      createTestExtra(authenticator)
    );

    expect(result.isOk()).toBe(true);
    expect(searchAnalytics).not.toHaveBeenCalled();
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(3);

    const calls = vi.mocked(searchConsumptionAnalytics).mock.calls;
    expect(
      calls.map(([, options]) => options?.aggregations?.by_group?.terms?.field)
    ).toEqual(
      expect.arrayContaining([
        "agent.attributed_id",
        "tool.attributed_skill_ids",
        "tool.server_name",
      ])
    );

    for (const [query] of calls) {
      expect(query.bool?.filter).toEqual(
        expect.arrayContaining([
          { term: { workspace_id: workspace.sId } },
          { term: { "user.id": user.sId } },
          {
            range: {
              completed_at: {
                gte: "2026-08-01T00:00:00.000Z",
                lt: "2026-08-03T00:00:00.000Z",
              },
            },
          },
        ])
      );
    }

    const agentCall = calls.find(
      ([, options]) =>
        options?.aggregations?.by_group?.terms?.field === "agent.attributed_id"
    );
    expect(agentCall?.[1]?.aggregations?.by_group).toMatchObject({
      terms: { order: { messages: "desc" } },
      aggs: {
        messages: {
          cardinality: { field: "agent_message_id" },
        },
      },
    });

    for (const field of ["tool.attributed_skill_ids", "tool.server_name"]) {
      const invocationCall = calls.find(
        ([, options]) => options?.aggregations?.by_group?.terms?.field === field
      );
      expect(invocationCall?.[1]?.aggregations?.by_group).toMatchObject({
        terms: { order: { _count: "desc" } },
      });
      expect(
        invocationCall?.[1]?.aggregations?.by_group?.aggs?.messages
      ).toBeUndefined();
    }
  });

  it("reads workspace activity and its anonymity floor from consumption analytics", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    mockConsumptionRankings({
      activeUserCount: MIN_USERS_FOR_ANONYMITY,
    });

    const result = await getToolByName("get_workspace_activity").handler(
      {},
      createTestExtra(authenticator)
    );

    expect(result.isOk()).toBe(true);
    expect(searchAnalytics).not.toHaveBeenCalled();
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(3);

    const calls = vi.mocked(searchConsumptionAnalytics).mock.calls;
    expect(
      calls.map(([, options]) => options?.aggregations?.by_group?.terms?.field)
    ).toEqual(["user.id", "agent.attributed_id", "tool.attributed_skill_ids"]);

    for (const [query] of calls) {
      expect(query.bool?.filter).toEqual(
        expect.arrayContaining([
          { term: { workspace_id: workspace.sId } },
          expect.objectContaining({
            range: expect.objectContaining({ completed_at: expect.anything() }),
          }),
        ])
      );
    }
  });
});
