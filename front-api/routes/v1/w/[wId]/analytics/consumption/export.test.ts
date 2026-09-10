import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { describe, expect, it, vi } from "vitest";

const mockedSearchConsumptionAnalytics = vi.mocked(
  searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>
);

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn(async () => new Map()) };
});

const MOCK_ES_DOC: AgentMessageConsumptionAnalyticsData = {
  workspace_id: "ws-1",
  agent: {
    attributed_id: "agent-1",
    id: "agent-1",
    version: "1",
    tag_ids: [],
    parent_ids: [],
    direct_parent_id: null,
    root_id: "agent-1",
    depth: 0,
  },
  agent_message_id: "msg-1",
  api_key_name: null,
  attribution_version: 1,
  completed_at: "2024-06-15T10:00:00.000Z",
  consumption_key: "run-usage:1",
  context_origin: "web",
  normalized_origin: "web",
  conversation_id: "conv-1",
  credit_micro: 6000,
  execution_time_ms: 1200,
  micro_usd: 3000,
  message_version: "1",
  parent_message_id: null,
  model: {
    provider_id: "openai",
    model_id: "gpt-5.6-luna",
    reasoning_effort: "high",
    resolution_method: null,
  },
  run_usage_id: "123",
  space_id: "space-1",
  status: "completed",
  step_index: 0,
  trigger_id: null,
  usage_type: "user",
  user: { id: "user-1", group_ids: [], seat_type: "pro" },
  consumption_type: "llm",
  gross_credit_micro: {
    system: 0,
    input: 2000,
    result_footprint: null,
    output: 4000,
    reasoning: 0,
    direct: 0,
    total: 6000,
  },
  tokens: {
    system: 0,
    input: 10,
    result_footprint: null,
    output: 20,
    reasoning: 0,
  },
  tool: null,
};

function mockEsSuccess() {
  mockedSearchConsumptionAnalytics.mockResolvedValueOnce(
    new Ok({
      took: 0,
      timed_out: false,
      _shards: { failed: 0, successful: 1, total: 1 },
      hits: {
        hits: [
          {
            _index: "consumption_analytics",
            _source: MOCK_ES_DOC,
            sort: [],
          },
        ],
      },
    })
  );
}

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
    mockEsSuccess();
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
    mockEsSuccess();
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
    mockEsSuccess();
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

  it("returns 400 when total filter values exceed 500", async () => {
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
        filter: {
          agents: Array.from({ length: 501 }, (_, i) => `agent-${i}`),
        },
      },
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 when a filter value exceeds 256 characters", async () => {
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
        filter: { agents: ["a".repeat(257)] },
      },
    });

    expect(response.status).toBe(400);
  });

  it("appends error to stream body on ES failure", async () => {
    enableFeatureFlag();
    mockedSearchConsumptionAnalytics.mockResolvedValueOnce(
      new Err(new ElasticsearchError("query_error", "shard failure"))
    );
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
    const body = await response.text();
    expect(body).toBe("ERROR: Internal server error.");
  });
});
