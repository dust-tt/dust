import handler from "@app/pages/api/v1/w/[wId]/analytics/export";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/observability/messages_metrics", async () => ({
  fetchMessageMetrics: vi.fn(
    async () =>
      new Ok([
        {
          timestamp: 1717200000000,
          count: 12,
          conversations: 3,
          activeUsers: 2,
        },
      ])
  ),
}));

vi.mock(
  "@app/lib/api/assistant/observability/active_users_metrics",
  async () => ({
    fetchActiveUsersMetrics: vi.fn(
      async () =>
        new Ok([
          {
            timestamp: 1717200000000,
            date: "2024-06-01",
            dau: 5,
            wau: 10,
            mau: 20,
            memberCount: 50,
          },
        ])
    ),
  })
);

vi.mock("@app/lib/api/assistant/observability/context_origin", async () => ({
  fetchContextOriginDailyBreakdown: vi.fn(
    async () =>
      new Ok([{ date: "2024-06-01", origin: "web", messageCount: 10 }])
  ),
}));

vi.mock("@app/lib/api/analytics/agents_export", async () => ({
  AGENT_EXPORT_HEADERS: ["name", "messages"],
  fetchAgentExportRows: vi.fn(
    async () => new Ok([{ name: "TestAgent", messages: 5 }])
  ),
}));

vi.mock("@app/lib/api/analytics/users_export", async () => ({
  USER_EXPORT_HEADERS: ["userName", "messageCount"],
  fetchUserExportRows: vi.fn(
    async () => new Ok([{ userName: "Alice", messageCount: 7 }])
  ),
}));

vi.mock("@app/lib/api/assistant/observability/skill_usage", async () => ({
  fetchAvailableSkills: vi.fn(async () => new Ok([])),
  fetchSkillUsageMetrics: vi.fn(async () => new Ok([])),
}));

vi.mock("@app/lib/api/assistant/observability/tool_usage", async () => ({
  fetchAvailableTools: vi.fn(async () => new Ok([])),
  fetchToolUsageMetrics: vi.fn(async () => new Ok([])),
}));

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

async function setupTest({
  table = "usage_metrics",
  startDate = "2024-06-01",
  endDate = "2024-06-30",
  timezone,
}: {
  table?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
} = {}) {
  const result = await createPublicApiMockRequest({ systemKey: true });
  await FeatureFlagFactory.basic(result.auth, "analytics_csv_export");

  const query: Record<string, string> = {
    wId: result.workspace.sId,
    table,
    startDate,
    endDate,
  };
  if (timezone) {
    query.timezone = timezone;
  }

  result.req.query = query;
  return result;
}

describe("GET /api/v1/w/[wId]/analytics/export", () => {
  it("returns 403 for non-admin API key", async () => {
    const { req, res } = await createPublicApiMockRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access workspace analytics.",
      },
    });
  });

  it("returns 403 without analytics_csv_export feature flag", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "The workspace does not have access to the analytics export API.",
      },
    });
  });

  it("returns 400 for missing required query params", async () => {
    const { req, res, auth, workspace } = await createPublicApiMockRequest({
      systemKey: true,
    });
    await FeatureFlagFactory.basic(auth, "analytics_csv_export");
    req.query = { wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 for invalid table value", async () => {
    const { req, res } = await setupTest({ table: "invalid_table" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const { req, res } = await setupTest({ startDate: "2024-13-01" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    const { req, res } = await setupTest({
      startDate: "2024-06-30",
      endDate: "2024-06-01",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 405 for unsupported methods", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
      const result = await createPublicApiMockRequest({
        method,
        systemKey: true,
      });
      await FeatureFlagFactory.basic(result.auth, "analytics_csv_export");
      result.req.query = {
        wId: result.workspace.sId,
        table: "usage_metrics",
        startDate: "2024-06-01",
        endDate: "2024-06-30",
      };

      await handler(result.req, result.res);

      expect(result.res._getStatusCode()).toBe(405);
    }
  });

  it("returns CSV for usage_metrics table", async () => {
    const { req, res } = await setupTest({ table: "usage_metrics" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/csv");
    expect(res.getHeader("Content-Disposition")).toContain(
      "dust_usage_metrics_2024-06-01_2024-06-30.csv"
    );
    const csv = res._getData();
    expect(csv).toContain("date,messages,conversations,activeUsers");
  });

  it("returns CSV for active_users table", async () => {
    const { req, res } = await setupTest({ table: "active_users" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const csv = res._getData();
    expect(csv).toContain("date,dau,wau,mau");
  });

  it("returns CSV for source table", async () => {
    const { req, res } = await setupTest({ table: "source" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const csv = res._getData();
    expect(csv).toContain("date,source,messageCount");
  });

  it("returns CSV for agents table", async () => {
    const { req, res } = await setupTest({ table: "agents" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const csv = res._getData();
    expect(csv).toContain("name,messages");
  });

  it("returns CSV for users table", async () => {
    const { req, res } = await setupTest({ table: "users" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const csv = res._getData();
    expect(csv).toContain("userName,messageCount");
  });

  it("returns CSV for skill_usage table", async () => {
    const { req, res } = await setupTest({ table: "skill_usage" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const csv = res._getData();
    expect(csv).toContain("date,skillName,executions,uniqueUsers");
  });

  it("returns CSV for tool_usage table", async () => {
    const { req, res } = await setupTest({ table: "tool_usage" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const csv = res._getData();
    expect(csv).toContain("date,toolName,executions,uniqueUsers");
  });
});
