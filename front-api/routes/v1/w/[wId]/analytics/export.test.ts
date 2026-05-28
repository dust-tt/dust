import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_BUILDER_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
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
  AGENT_EXPORT_HEADERS: ["agentId", "name", "messages"],
  fetchAgentExportRows: vi.fn(
    async () =>
      new Ok([{ agentId: "agent-123", name: "TestAgent", messages: 5 }])
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

vi.mock("@app/lib/api/analytics/messages_export", async () => ({
  MESSAGE_EXPORT_HEADERS: [
    "messageId",
    "createdAt",
    "assistantId",
    "assistantName",
    "assistantSettings",
    "conversationId",
    "userId",
    "userEmail",
    "source",
  ],
  fetchMessageExportRows: vi.fn(
    async () =>
      new Ok([
        {
          messageId: "msg-1",
          createdAt: "2024-06-01 10:00:00",
          assistantId: "agent-1",
          assistantName: "TestAgent",
          assistantSettings: "published",
          conversationId: "conv-1",
          userId: "user-1",
          userEmail: "alice@example.com",
          source: "web",
        },
      ])
  ),
}));

async function setupTest({
  table = "usage_metrics",
  startDate = "2024-06-01",
  endDate = "2024-06-30",
  timezone,
  format,
  role = "admin",
  method = "GET",
}: {
  table?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  format?: string;
  role?: "user" | "builder" | "admin";
  method?: string;
} = {}) {
  const { workspace, key } = await createPublicApiMockRequest({ role });

  const query: Record<string, string> = { table, startDate, endDate };
  if (timezone) {
    query.timezone = timezone;
  }
  if (format) {
    query.format = format;
  }

  const response = await exportRequest({ workspace, key, query, method });
  return { response };
}

function exportRequest({
  workspace,
  key,
  query = {},
  method = "GET",
}: {
  workspace: { sId: string };
  key: { secret: string };
  query?: Record<string, string>;
  method?: string;
}) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/analytics/export${qs ? `?${qs}` : ""}`,
    {
      method,
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/[wId]/analytics/export", () => {
  it("returns 200 for admin API key", async () => {
    const { response } = await setupTest();

    expect(response.status).toBe(200);
  });

  // TODO(api-key-scopes): once builder keys are migrated to admin scope and the
  // temporary fallback in export.ts is removed, change this to expect 403.
  it("returns 200 for builder API key (temporary backward-compat)", async () => {
    const { response } = await setupTest({ role: "builder" });

    expect(response.status).toBe(200);
  });

  it("returns 403 for read-only API key (insufficient scope)", async () => {
    const { response } = await setupTest({ role: "user" });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: ENSURE_IS_BUILDER_ERROR_MESSAGE,
      },
    });
  });

  it("returns 400 for missing required query params", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await exportRequest({ workspace, key });

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid table value", async () => {
    const { response } = await setupTest({ table: "invalid_table" });

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const { response } = await setupTest({ startDate: "2024-13-01" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    const { response } = await setupTest({
      startDate: "2024-06-30",
      endDate: "2024-06-01",
    });

    expect(response.status).toBe(400);
  });

  it("returns 405 for unsupported methods", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
      const { workspace, key } = await createPublicApiMockRequest({
        method,
        role: "admin",
      });

      const response = await exportRequest({
        workspace,
        key,
        query: {
          table: "usage_metrics",
          startDate: "2024-06-01",
          endDate: "2024-06-30",
        },
        method,
      });

      expect(response.status).toBe(405);
    }
  });

  it("returns CSV for usage_metrics table", async () => {
    const { response } = await setupTest({ table: "usage_metrics" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain(
      "dust_usage_metrics_2024-06-01_2024-06-30.csv"
    );
    const csv = await response.text();
    expect(csv).toContain("date,messages,conversations,activeUsers");
  });

  it("returns CSV for active_users table", async () => {
    const { response } = await setupTest({ table: "active_users" });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("date,dau,wau,mau");
  });

  it("returns CSV for source table", async () => {
    const { response } = await setupTest({ table: "source" });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("date,source,messageCount");
  });

  it("returns CSV for agents table", async () => {
    const { response } = await setupTest({ table: "agents" });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("agentId,name,messages");
  });

  it("returns CSV for users table", async () => {
    const { response } = await setupTest({ table: "users" });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("userName,messageCount");
  });

  it("returns CSV for skill_usage table", async () => {
    const { response } = await setupTest({ table: "skill_usage" });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("date,skillName,executions,uniqueUsers");
  });

  it("returns CSV for tool_usage table", async () => {
    const { response } = await setupTest({ table: "tool_usage" });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("date,toolName,executions,uniqueUsers");
  });

  it("returns CSV for messages table", async () => {
    const { response } = await setupTest({ table: "messages" });

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(
      "messageId,createdAt,assistantId,assistantName,assistantSettings,conversationId,userId,userEmail,source"
    );
    expect(csv).toContain("msg-1");
    expect(csv).toContain("alice@example.com");
  });

  it("returns typed JSON when format=json for usage_metrics", async () => {
    const { response } = await setupTest({
      table: "usage_metrics",
      format: "json",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toEqual({
      date: "2024-06-01",
      messages: 12,
      conversations: 3,
      activeUsers: 2,
    });
  });

  it("returns typed JSON for active_users", async () => {
    const { response } = await setupTest({
      table: "active_users",
      format: "json",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data[0]).toEqual({
      date: "2024-06-01",
      dau: 5,
      wau: 10,
      mau: 20,
    });
  });

  it("returns typed JSON for source", async () => {
    const { response } = await setupTest({
      table: "source",
      format: "json",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data[0]).toEqual({
      date: "2024-06-01",
      source: "web",
      messageCount: 10,
    });
  });

  it("returns typed JSON for agents", async () => {
    const { response } = await setupTest({
      table: "agents",
      format: "json",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data[0]).toEqual({
      agentId: "agent-123",
      name: "TestAgent",
      messages: 5,
    });
  });

  it("returns typed JSON for users", async () => {
    const { response } = await setupTest({
      table: "users",
      format: "json",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data[0]).toEqual({
      userName: "Alice",
      messageCount: 7,
    });
  });

  it("returns typed JSON for messages", async () => {
    const { response } = await setupTest({
      table: "messages",
      format: "json",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data[0]).toEqual({
      messageId: "msg-1",
      createdAt: "2024-06-01 10:00:00",
      assistantId: "agent-1",
      assistantName: "TestAgent",
      assistantSettings: "published",
      conversationId: "conv-1",
      userId: "user-1",
      userEmail: "alice@example.com",
      source: "web",
    });
  });

  it("returns CSV by default (no format param)", async () => {
    const { response } = await setupTest({ table: "usage_metrics" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
  });

  it("returns CSV when format=csv", async () => {
    const { response } = await setupTest({
      table: "usage_metrics",
      format: "csv",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
  });

  it("returns 400 for invalid format value", async () => {
    const { response } = await setupTest({
      table: "usage_metrics",
      format: "xml",
    });

    expect(response.status).toBe(400);
  });
});
