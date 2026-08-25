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
                    completed_at: { gte: "2024-01-01", lt: "2024-02-01" },
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
    const exclusiveEndDate = today.clone().add(1, "day").format("YYYY-MM-DD");
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
                    completed_at: { gte: startDate, lt: exclusiveEndDate },
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
              completed_at: { gte: "2024-01-01", lt: "2024-02-01" },
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
