import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
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
  user: {
    id: "user-1",
    group_ids: [],
    seat_type: "pro",
    shared_usage_limit_group_id: null,
  },
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

const MOCK_ES_TOOL_DOC: AgentMessageConsumptionAnalyticsData = {
  ...MOCK_ES_DOC,
  consumption_key: "action:1",
  consumption_type: "tool",
  credit_micro: 1_234_567,
  micro_usd: null,
  model: null,
  gross_credit_micro: {
    system: 0,
    input: null,
    result_footprint: null,
    output: null,
    reasoning: 0,
    direct: 1_234_567,
    total: 1_234_567,
  },
  tokens: {
    system: 0,
    input: null,
    result_footprint: 0,
    output: 0,
    reasoning: 0,
  },
  tool: {
    name: "search",
    server_name: "web_search",
    parent_server_name: "",
    action_id: "action-1",
    attributed_skill_ids: [],
  },
};

function docWithUserGroups(
  groupIds: string[]
): AgentMessageConsumptionAnalyticsData {
  return {
    ...MOCK_ES_DOC,
    user: {
      id: "user-1",
      group_ids: groupIds,
      seat_type: "pro",
      shared_usage_limit_group_id: null,
    },
  };
}

function mockEsSuccess(
  doc: AgentMessageConsumptionAnalyticsData = MOCK_ES_DOC
) {
  mockedSearchConsumptionAnalytics.mockResolvedValueOnce(
    new Ok({
      took: 0,
      timed_out: false,
      _shards: { failed: 0, successful: 1, total: 1 },
      hits: {
        hits: [
          {
            _index: "consumption_analytics",
            _source: doc,
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

// A user-role key holding `read_analytics` on `target` only, through a regular_auto grant group.
async function createGroupScopedKey() {
  const { workspace, globalGroup } = await createPublicApiMockRequest({
    role: "admin",
  });
  const target = await GroupFactory.regularManual(workspace, "Target");
  const other = await GroupFactory.regularManual(workspace, "Other");
  const grantGroup = await GroupFactory.regularAuto(workspace, "Grant");
  await GroupPermissionResource.grant(
    await Authenticator.internalAdminForWorkspace(workspace.sId),
    {
      group: grantGroup,
      grantType: "analytics_reader",
      resourceType: "group",
      resourceId: target.id,
    }
  );
  const key = await KeyFactory.regular([globalGroup, grantGroup]);
  return { workspace, globalGroup, key, target, other };
}

const GROUP_SCOPE_ERROR = {
  error: {
    type: "workspace_auth_error",
    message:
      "Exporting consumption analytics requires an admin API key, or a filter on groups whose " +
      "analytics the API key can read.",
  },
};

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
    mockEsSuccess(MOCK_ES_TOOL_DOC);
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
      "dust_consumption_2024-06-01T00:00:00.000Z_2024-06-15T00:00:00.000Z.csv"
    );
    const csv = await response.text();
    expect(csv).toContain("completedAt");
    expect(csv).toContain("conv-1");
    const [header, row] = csv.trim().split("\n");
    const headers = header.split(",");
    expect(headers).toContain("creditsAction");
    expect(headers).not.toContain("creditsDirect");
    expect(row.split(",")[headers.indexOf("creditsAction")]).toBe("1.23");
  });

  it("returns 200 NDJSON when format=ndjson", async () => {
    enableFeatureFlag();
    mockEsSuccess(MOCK_ES_TOOL_DOC);
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
    expect(parsed.creditsAction).toBe(1.23);
    expect(parsed).not.toHaveProperty("creditsDirect");
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
        type: "feature_flag_not_found",
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
    expect(await response.json()).toEqual(GROUP_SCOPE_ERROR);
  });

  it("returns 200 for a user API key on groups it can read, listing only those groups", async () => {
    enableFeatureFlag();
    const { workspace, key, target, other } = await createGroupScopedKey();
    mockEsSuccess(docWithUserGroups([other.sId, target.sId]));

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
        format: "ndjson",
        filter: { groups: [target.sId], agents: ["agent-1"] },
      },
    });

    expect(response.status).toBe(200);
    const parsed = JSON.parse((await response.text()).trim());
    expect(parsed.userGroupIds).toBe(target.sId);
    expect(parsed.userGroupNames).toBe(target.sId);
    expect(
      JSON.stringify(mockedSearchConsumptionAnalytics.mock.lastCall?.[0])
    ).toContain(`{"term":{"user.group_ids":"${target.sId}"}}`);
  });

  it("lists every group of the user for an admin API key", async () => {
    enableFeatureFlag();
    const { workspace, globalGroup, target, other } =
      await createGroupScopedKey();
    const adminKey = await KeyFactory.admin(globalGroup);
    mockEsSuccess(docWithUserGroups([other.sId, target.sId]));

    const response = await consumptionExportRequest({
      workspace,
      key: adminKey,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
        format: "ndjson",
        filter: { groups: [target.sId] },
      },
    });

    expect(response.status).toBe(200);
    const parsed = JSON.parse((await response.text()).trim());
    expect(parsed.userGroupIds).toBe(`${other.sId}; ${target.sId}`);
  });

  it("returns 403 for a user API key without a group filter, or with an empty group id", async () => {
    enableFeatureFlag();
    const { workspace, key } = await createGroupScopedKey();

    for (const filter of [
      undefined,
      { agents: ["agent-1"] },
      { groups: [""] },
    ]) {
      const response = await consumptionExportRequest({
        workspace,
        key,
        body: {
          startDate: "2024-06-01T00:00:00Z",
          endDate: "2024-06-15T00:00:00Z",
          filter,
        },
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual(GROUP_SCOPE_ERROR);
    }
  });

  it("returns 403 for a user API key when one requested group is not readable", async () => {
    enableFeatureFlag();
    const { workspace, key, target, other } = await createGroupScopedKey();
    mockedSearchConsumptionAnalytics.mockClear();

    const response = await consumptionExportRequest({
      workspace,
      key,
      body: {
        startDate: "2024-06-01T00:00:00Z",
        endDate: "2024-06-15T00:00:00Z",
        filter: { groups: [target.sId, other.sId] },
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(GROUP_SCOPE_ERROR);
    expect(mockedSearchConsumptionAnalytics).not.toHaveBeenCalled();
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
    const json = await response.json();
    expect(json.error.type).toBe("invalid_request_error");
    expect(json.error.message).toContain("Time range must not exceed 30 days");
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
    const json = await response.json();
    expect(json.error.type).toBe("invalid_request_error");
    expect(json.error.message).toContain(
      "startDate must be strictly before endDate"
    );
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
    const json = await response.json();
    expect(json.error.type).toBe("invalid_request_error");
    expect(json.error.message).toContain("startDate");
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
    expect(await response.json()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
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

  it("returns 400 when filter values exceed 500 dimensions", async () => {
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
    const json = await response.json();
    expect(json.error.type).toBe("invalid_request_error");
    expect(json.error.message).toContain(
      "Filter must not exceed 500 values total"
    );
  });

  it("returns 400 when filter values exceed 500 across all dimensions", async () => {
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
          agents: Array.from({ length: 250 }, (_, i) => `agent-${i}`),
          tags: Array.from({ length: 251 }, (_, i) => `tag-${i}`),
        },
      },
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.type).toBe("invalid_request_error");
    expect(json.error.message).toContain(
      "Filter must not exceed 500 values total"
    );
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
    const json = await response.json();
    expect(json.error.type).toBe("invalid_request_error");
    expect(json.error.message).toContain("256");
  });

  it("returns 500 with API error on ES failure", async () => {
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

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to export consumption analytics.",
      },
    });
  });
});
