import { exportTable } from "@app/lib/api/analytics/export_tables";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Ok } from "@app/types/shared/result";
import moment from "moment-timezone";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep `bucketsToArray` (and everything else) real; only stub the
// Elasticsearch query so the test does not depend on a live cluster.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

// The export reads from the read replica; in tests there is no replica so
// point it at the primary test connection.
vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

describe("exportTable agents", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("queries the consumption index with a half-open completed_at range and returns its aggregated metrics", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Agent" }
    );

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: {
          by_agent: {
            buckets: [
              {
                key: agent.sId,
                doc_count: 5,
                unique_messages: { value: 3 },
                unique_users: { value: 2 },
                unique_conversations: { value: 1 },
                credit_micro: { value: 2_000_000 },
              },
            ],
          },
        },
      })
    );

    const result = await exportTable({
      auth: authenticator,
      table: "agents",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      timezone: "UTC",
      owner: workspace,
      includeHiddenAgents: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    if (result.value.table !== "agents") {
      throw new Error(`Expected "agents" table, got "${result.value.table}"`);
    }

    // Regression: exportAgents used to build its query with the legacy,
    // timestamp-based buildAgentAnalyticsBaseQuery, which the consumption
    // index does not have a `timestamp` field for — every agent row silently
    // came back with zero metrics. It must now query the consumption index
    // with a half-open [startDate, endDate) `completed_at` range, bumping the
    // inclusive `endDate` calendar day up by one day.
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          {
            bool: {
              filter: [
                { term: { workspace_id: workspace.sId } },
                {
                  range: {
                    completed_at: {
                      gte: "2024-01-01T00:00:00.000Z",
                      lt: "2024-02-01T00:00:00.000Z",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });

    const row = result.value.rows.find((r) => r.agentId === agent.sId);
    expect(row).toBeDefined();
    expect(row!.messages).toBe(3);
    expect(row!.distinctUsersReached).toBe(2);
    expect(row!.distinctConversations).toBe(1);
    expect(row!.credits).toBe(2);
  });
});

describe("exportTable users", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("queries the consumption index with a half-open completed_at range and returns its aggregated metrics", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    // The user's membership is created "now" by createResourceTest, so the
    // window has to cover the present rather than a fixed historical range
    // (unlike the agents test, this one hits the real memberships table).
    const today = moment.utc();
    const startDate = today.clone().subtract(30, "days").format("YYYY-MM-DD");
    const endDate = today.format("YYYY-MM-DD");
    const startInstant = moment
      .tz(startDate, "UTC")
      .startOf("day")
      .toISOString();
    const exclusiveEndInstant = moment
      .tz(endDate, "UTC")
      .add(1, "day")
      .startOf("day")
      .toISOString();
    const lastMessageAt = today.clone().subtract(1, "day");

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: {
          by_user: {
            buckets: [
              {
                key: user.sId,
                doc_count: 5,
                unique_messages: { value: 4 },
                last_message: { value: lastMessageAt.valueOf() },
                active_days: { buckets: [{ doc_count: 1 }, { doc_count: 1 }] },
                credit_micro: { value: 3_000_000 },
              },
            ],
          },
        },
      })
    );

    const result = await exportTable({
      auth: authenticator,
      table: "users",
      startDate,
      endDate,
      timezone: "UTC",
      owner: workspace,
      includeHiddenAgents: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    if (result.value.table !== "users") {
      throw new Error(`Expected "users" table, got "${result.value.table}"`);
    }

    // Regression: exportUsers used to build its query with the legacy,
    // timestamp-based buildAgentAnalyticsBaseQuery, which the consumption
    // index does not have a `timestamp` field for — every user row silently
    // came back with zero metrics. It must now query the consumption index
    // with a half-open [startDate, endDate) `completed_at` range, bumping the
    // inclusive `endDate` calendar day up by one day.
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          {
            bool: {
              filter: [
                { term: { workspace_id: workspace.sId } },
                {
                  range: {
                    completed_at: {
                      gte: startInstant,
                      lt: exclusiveEndInstant,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });

    const row = result.value.rows.find((r) => r.userId === user.sId);
    expect(row).toBeDefined();
    expect(row!.messageCount).toBe(4);
    expect(row!.activeDaysCount).toBe(2);
    expect(row!.credits).toBe(3);
    expect(row!.lastMessageSent).toBe(lastMessageAt.format("YYYY-MM-DD"));
  });
});

describe("exportTable skills", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("queries the consumption index with a half-open completed_at range for skill attribution", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const skill = await SkillFactory.create(authenticator, {
      name: "Test Skill",
    });

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: {
          by_skill_id: { buckets: [] },
        },
      })
    );

    const result = await exportTable({
      auth: authenticator,
      table: "skills",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      timezone: "UTC",
      owner: workspace,
      includeHiddenAgents: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    if (result.value.table !== "skills") {
      throw new Error(`Expected "skills" table, got "${result.value.table}"`);
    }

    // Regression: exportSkills used to build its query with the legacy,
    // timestamp-based buildAgentAnalyticsBaseQuery. It must now query the
    // consumption index with a half-open [startDate, endDate) `completed_at`
    // range, bumping the inclusive `endDate` calendar day up by one day.
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          {
            range: {
              completed_at: {
                gte: "2024-01-01T00:00:00.000Z",
                lt: "2024-02-01T00:00:00.000Z",
              },
            },
          },
        ],
      },
    });

    const row = result.value.rows.find((r) => r.skillId === skill.sId);
    expect(row).toBeDefined();
    expect(row!.name).toBe("Test Skill");
  });
});

describe("exportTable usage_metrics", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("queries the consumption index with a half-open completed_at range and returns its aggregated metrics", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: {
          by_date: {
            buckets: [
              {
                key: Date.UTC(2024, 0, 15),
                key_as_string: "2024-01-15",
                doc_count: 10,
                unique_messages: { value: 4 },
                unique_conversations: { value: 3 },
                unique_users: { value: 2 },
              },
            ],
          },
        },
      })
    );

    const result = await exportTable({
      auth: authenticator,
      table: "usage_metrics",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      timezone: "UTC",
      owner: workspace,
      includeHiddenAgents: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    if (result.value.table !== "usage_metrics") {
      throw new Error(
        `Expected "usage_metrics" table, got "${result.value.table}"`
      );
    }

    // Regression: exportUsageMetrics used to build its query with the legacy,
    // timestamp-based buildAgentAnalyticsBaseQuery. It must now query the
    // consumption index with a half-open [startDate, endDate) `completed_at`
    // range, bumping the inclusive `endDate` calendar day up by one day, and
    // dedupe messages by agent_message_id since the consumption index splits
    // a message across several documents.
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          {
            range: {
              completed_at: {
                gte: "2024-01-01T00:00:00.000Z",
                lt: "2024-02-01T00:00:00.000Z",
              },
            },
          },
        ],
      },
    });

    expect(result.value.rows).toEqual([
      { date: "2024-01-15", messages: 4, conversations: 3, activeUsers: 2 },
    ]);
  });

  it("resolves the completed_at range from timezone-local day boundaries, not UTC", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: { by_date: { buckets: [] } },
      })
    );

    await exportTable({
      auth: authenticator,
      table: "usage_metrics",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      // UTC-8: local midnight on 2024-01-01 is 2024-01-01T08:00:00.000Z, not
      // 2024-01-01T00:00:00.000Z. A bare-date range filter is parsed by
      // Elasticsearch as UTC midnight, which would disagree with the
      // date_histogram aggregation's timezone-local day buckets and cut off
      // the first/last local day's early-morning activity.
      timezone: "America/Los_Angeles",
      owner: workspace,
      includeHiddenAgents: false,
    });

    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          {
            range: {
              completed_at: {
                gte: "2024-01-01T08:00:00.000Z",
                lt: "2024-02-01T08:00:00.000Z",
              },
            },
          },
        ],
      },
    });
  });
});

describe("exportTable source", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("queries the consumption index with a half-open completed_at range and returns its aggregated metrics", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
        aggregations: {
          by_date: {
            buckets: [
              {
                key: Date.UTC(2024, 0, 15),
                key_as_string: "2024-01-15",
                doc_count: 10,
                by_origin: {
                  buckets: [
                    { key: "web", doc_count: 6, unique_messages: { value: 3 } },
                    {
                      key: "slack",
                      doc_count: 4,
                      unique_messages: { value: 2 },
                    },
                  ],
                },
              },
            ],
          },
        },
      })
    );

    const result = await exportTable({
      auth: authenticator,
      table: "source",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      timezone: "UTC",
      owner: workspace,
      includeHiddenAgents: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    if (result.value.table !== "source") {
      throw new Error(`Expected "source" table, got "${result.value.table}"`);
    }

    // Regression: exportSource used to build its query with the legacy,
    // timestamp-based buildAgentAnalyticsBaseQuery, which the consumption
    // index does not have a `timestamp` field for — every source row
    // silently came back with zero metrics. It must now query the
    // consumption index with a half-open [startDate, endDate) `completed_at`
    // range, bumping the inclusive `endDate` calendar day up by one day. The
    // message count within a day must also dedupe by agent_message_id
    // instead of using raw doc_count, since the consumption index splits a
    // message across several documents.
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(1);
    const [query] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          {
            range: {
              completed_at: {
                gte: "2024-01-01T00:00:00.000Z",
                lt: "2024-02-01T00:00:00.000Z",
              },
            },
          },
        ],
      },
    });

    expect(result.value.rows).toEqual([
      { date: "2024-01-15", source: "slack", messageCount: 2 },
      { date: "2024-01-15", source: "web", messageCount: 3 },
    ]);
  });
});
