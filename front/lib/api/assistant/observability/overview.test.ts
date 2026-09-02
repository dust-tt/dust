import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

const SHARDS = { total: 1, successful: 1, skipped: 0, failed: 0 };

function mockOverviewAggs(aggs: {
  active_users?: number;
  conversations?: number;
  total_messages?: number;
}) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: SHARDS,
      hits: { total: { value: 0, relation: "eq" as const }, hits: [] },
      aggregations: {
        active_users: { value: aggs.active_users ?? 0 },
        conversations: { value: aggs.conversations ?? 0 },
        total_messages: { value: aggs.total_messages ?? 0 },
      },
    })
  );
}

describe("fetchAgentOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns overview metrics from aggregation values", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    mockOverviewAggs({
      active_users: 42,
      conversations: 120,
      total_messages: 350,
    });

    const result = await fetchAgentOverview(authenticator, {
      agentId: "agent-abc",
      days: 30,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toEqual({
      activeUsers: 42,
      conversationCount: 120,
      messageCount: 350,
    });
  });

  it("defaults to 0 when aggregation values are missing", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: SHARDS,
        hits: { total: { value: 0, relation: "eq" as const }, hits: [] },
        aggregations: {},
      })
    );

    const result = await fetchAgentOverview(authenticator, {
      agentId: "agent-abc",
      days: 7,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toEqual({
      activeUsers: 0,
      conversationCount: 0,
      messageCount: 0,
    });
  });

  it("passes agent filter and version to the ES query", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    mockOverviewAggs({});

    await fetchAgentOverview(authenticator, {
      agentId: "agent-xyz",
      days: 14,
      version: "3",
    });

    expect(searchConsumptionAnalytics).toHaveBeenCalledOnce();

    const [query, options] = vi.mocked(searchConsumptionAnalytics).mock
      .calls[0];

    const filters = (query as { bool: { filter: unknown[] } }).bool.filter;
    const hasAgentFilter = filters.some(
      (f: any) =>
        f?.term?.["agent.attributed_id"] === "agent-xyz" ||
        f?.terms?.["agent.attributed_id"]?.includes("agent-xyz")
    );
    expect(hasAgentFilter).toBe(true);

    const hasVersionFilter = filters.some(
      (f: any) => f?.term?.["agent.version"] === "3"
    );
    expect(hasVersionFilter).toBe(true);

    expect(options?.size).toBe(0);
  });
});
