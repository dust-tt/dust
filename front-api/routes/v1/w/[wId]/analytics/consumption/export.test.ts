import { Authenticator } from "@app/lib/auth";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { afterEach, describe, expect, it, vi } from "vitest";

const MOCK_ROWS = [
  {
    completedAt: "2024-06-15T10:00:00.000Z",
    conversationId: "conv-1",
    spaceId: "space-1",
    agentMessageId: "msg-1",
    consumptionType: "llm",
    agentId: "agent-1",
    agentName: "TestAgent",
    agentVersion: "1",
    agentTagIds: "",
    agentRootId: "",
    agentParentId: "",
    agentDepth: 0,
    modelProviderId: "openai",
    modelId: "gpt-4",
    modelName: "GPT-4",
    modelReasoningEffort: "",
    modelResolutionMethod: "",
    userId: "user-1",
    userName: "Alice",
    userGroupIds: "",
    userGroupNames: "",
    triggerId: "",
    contextOrigin: "web",
    apiKeyName: "",
    toolName: "",
    toolServerName: "",
    toolDisplayName: "",
    toolParentServerName: "",
    toolActionId: "",
    attributedSkillIds: "",
    attributedSkillNames: "",
    creditsSystem: 0.01,
    creditsInput: 0.02,
    creditsOutput: 0.03,
    creditsReasoning: 0,
    creditsDirect: 0,
    totalCredits: 0.06,
    usageType: "chat",
    status: "completed",
    stepIndex: 0,
    executionTimeMs: 1200,
  },
];

vi.mock(
  "@app/lib/api/analytics/consumption/export_lines",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@app/lib/api/analytics/consumption/export_lines")
    >()),
    fetchConsumptionExportRows: vi.fn(async () => new Ok(MOCK_ROWS)),
  })
);

afterEach(() => {
  vi.restoreAllMocks();
});

function enableFeatureFlag() {
  vi.spyOn(Authenticator.prototype, "hasFeatureFlag").mockResolvedValue(true);
}

function disableFeatureFlag() {
  vi.spyOn(Authenticator.prototype, "hasFeatureFlag").mockResolvedValue(false);
}

function consumptionExportRequest({
  workspace,
  key,
  body,
  method = "POST",
}: {
  workspace: { sId: string };
  key: { secret: string };
  body?: Record<string, unknown>;
  method?: string;
}) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/analytics/consumption/export`,
    {
      method,
      headers: {
        authorization: `Bearer ${key.secret}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
}

describe("POST /api/v1/w/[wId]/analytics/consumption/export", () => {
  it("returns 200 CSV for admin API key with feature flag", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain(
      "dust_consumption_2024-06-01T00:00:00Z_2024-06-15T00:00:00Z.csv"
    );
    const csv = await response.text();
    expect(csv).toContain("completedAt");
    expect(csv).toContain("conv-1");
  });

  it("returns 200 NDJSON when format=ndjson", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
        format: "ndjson",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    const text = await response.text();
    const parsed = JSON.parse(text.trim());
    expect(parsed.conversationId).toBe("conv-1");
    expect(parsed.totalCredits).toBe(0.06);
  });

  it("returns 403 when feature flag is not enabled", async () => {
    disableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "The workspace does not have access to the consumption export API.",
      },
    });
  });

  it("returns 403 for read-only API key", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "user",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: ENSURE_IS_ADMIN_ERROR_MESSAGE,
      },
    });
  });

  it("returns 400 when time range exceeds 30 days", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-08-01T00:00:00Z",
      },
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-30T00:00:00Z",
        endDate: "2024-06-01T00:00:00Z",
      },
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {},
    });

    expect(response.status).toBe(400);
  });

  it("returns 405 for GET", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      method: "GET",
    });

    expect(response.status).toBe(405);
  });

  it("accepts optional filter parameter", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createPublicApiMockRequest({
      role: "admin",
    });

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
        filter: { agents: ["agent-1"] },
      },
    });

    expect(response.status).toBe(200);
  });
});
