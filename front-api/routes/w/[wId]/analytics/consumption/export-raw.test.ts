// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).
// This directive makes them available in the test environment.

import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type {
  AgentMessageConsumptionAnalyticsLlmData,
  AgentMessageConsumptionAnalyticsToolData,
} from "@app/types/assistant/analytics";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import AdmZip from "adm-zip";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});
vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

const LLM_DOC: AgentMessageConsumptionAnalyticsLlmData = {
  workspace_id: "w1",
  agent: {
    id: "agent1",
    version: "1",
    tag_ids: ["tag1"],
    parent_ids: [],
    direct_parent_id: null,
    root_id: "agent1",
    depth: 0,
  },
  agent_message_id: "msg1",
  api_key_name: null,
  attribution_version: 1,
  completed_at: "2026-08-01T00:00:00.000Z",
  consumption_key: "run-usage:1",
  context_origin: "api",
  normalized_origin: "api",
  conversation_id: "conv1",
  credit_micro: 1_000_000,
  execution_time_ms: null,
  message_version: "1",
  model: {
    provider_id: "anthropic",
    model_id: "claude-sonnet-5",
    reasoning_effort: "medium",
    resolution_method: "auto",
  },
  run_usage_id: "123",
  space_id: "space1",
  status: "succeeded",
  step_index: 0,
  trigger_id: null,
  usage_type: "user",
  user: { id: "user1", group_ids: ["group1"] },
  consumption_type: "llm",
  gross_credit_micro: {
    system: 100_000,
    input: 200_000,
    result_footprint: null,
    output: 300_000,
    reasoning: 400_000,
    direct: 0,
    total: 1_000_000,
  },
  tokens: {
    system: 10,
    input: 20,
    result_footprint: null,
    output: 30,
    reasoning: 40,
  },
  tool: null,
};

const TOOL_DOC: AgentMessageConsumptionAnalyticsToolData = {
  ...LLM_DOC,
  consumption_key: "action:1",
  consumption_type: "tool",
  model: null,
  gross_credit_micro: {
    system: 0,
    input: null,
    result_footprint: null,
    output: null,
    reasoning: 0,
    direct: 500_000,
    total: 500_000,
  },
  tokens: {
    system: 0,
    input: null,
    result_footprint: 15,
    output: 5,
    reasoning: 0,
  },
  tool: {
    name: "search",
    server_name: "server1",
    parent_server_name: "",
    action_id: "action1",
    attributed_skill_ids: ["skill1"],
  },
  credit_micro: 500_000,
  execution_time_ms: 250,
};

function mockDocs(docs: unknown[]) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      hits: { hits: docs.map((doc) => ({ _source: doc, sort: [] })) },
    }) as unknown as Awaited<ReturnType<typeof searchConsumptionAnalytics>>
  );
}

function mockLabels(labels: Record<string, string>) {
  vi.mocked(resolveDimensionLabels).mockImplementation(
    async (_a, _d, keys) =>
      new Map(
        keys
          .filter((key) => key in labels)
          .map((key) => [
            key,
            { name: labels[key], pictureUrl: null, description: null },
          ])
      )
  );
}

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function postExportRawRequest(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/analytics/consumption/export-raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/analytics/consumption/export-raw", () => {
  it("returns every raw consumption line as a CSV in a zip attachment", async () => {
    mockDocs([LLM_DOC, TOOL_DOC]);
    mockLabels({
      agent1: "@dust",
      user1: "Alice",
      group1: "Engineering",
      "claude-sonnet-5": "Claude Sonnet 5",
      server1: "Search Tool",
      skill1: "Research",
      api: "API",
    });
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postExportRawRequest(workspace.sId, {});

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain(
      `filename="dust_consumption_lines_export_${workspace.sId}.zip"`
    );

    const buffer = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(buffer);
    expect(zip.getEntries().map((entry) => entry.entryName)).toEqual([
      "lines.csv",
    ]);

    const csv = zip.getEntry("lines.csv")?.getData().toString("utf-8");
    expect(csv).toContain(
      "completedAt,conversationId,spaceId,agentMessageId,consumptionType,agentId,agentName"
    );
    // LLM row: resolved agent/user/group/model names, no tool columns.
    expect(csv).toContain(
      "2026-08-01T00:00:00.000Z,conv1,space1,msg1,llm,agent1,'@dust"
    );
    expect(csv).toContain("claude-sonnet-5,Claude Sonnet 5");
    expect(csv).toContain("user1,Alice,group1,Engineering");
    // Tool row: resolved tool/skill names, no model.
    expect(csv).toContain(
      "2026-08-01T00:00:00.000Z,conv1,space1,msg1,tool,agent1,'@dust"
    );
    expect(csv).toContain("search,server1,Search Tool");
    expect(csv).toContain("skill1,Research");
  });

  it("is refused to non-managers", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postExportRawRequest(workspace.sId, {});

    expect(response.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    const { workspace } = await setupTest();

    const response = await postExportRawRequest(workspace.sId, {
      days: "not-a-number",
    });

    expect(response.status).toBe(400);
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest();

    const response = await postExportRawRequest(workspace.sId, {});

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
