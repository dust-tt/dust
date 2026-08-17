// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).
// This directive makes them available in the test environment.

import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { notifyConsumptionExportReady } from "@app/lib/notifications/workflows/consumption-export-ready";
import {
  buildConsumptionExportGcsPrefix,
  runConsumptionExportActivity,
} from "@app/temporal/analytics_queue/activities/consumption_export";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import type {
  AgentMessageConsumptionAnalyticsData,
  AgentMessageConsumptionAnalyticsLlmData,
  AgentMessageConsumptionAnalyticsToolData,
} from "@app/types/assistant/analytics";
import { Err, Ok } from "@app/types/shared/result";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Instantiation expression: pins the mock to the concrete TDocument the exporter
// actually queries with, so mockResolvedValue can be given a fully-typed
// SearchResponse below without an `as` cast.
const mockedSearchConsumptionAnalytics = vi.mocked(
  searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>
);

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});
vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});
vi.mock(
  import("@app/lib/notifications/workflows/consumption-export-ready"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, notifyConsumptionExportReady: vi.fn() };
  }
);

beforeEach(() => {
  vi.mocked(notifyConsumptionExportReady).mockClear();
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

function mockDocs(docs: AgentMessageConsumptionAnalyticsData[]) {
  mockedSearchConsumptionAnalytics.mockResolvedValue(
    new Ok({
      took: 0,
      timed_out: false,
      _shards: { failed: 0, successful: 1, total: 1 },
      hits: {
        hits: docs.map((doc) => ({
          _index: "consumption_analytics",
          _source: doc,
          sort: [],
        })),
      },
    })
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

async function setup() {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });
  return { authenticator, workspace };
}

describe("runConsumptionExportActivity", () => {
  it("uploads the CSV export to GCS under the workspace prefix", async () => {
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
    const { authenticator, workspace } = await setup();

    await runConsumptionExportActivity(authenticator.toJSON(), {
      period: {
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-02T00:00:00.000Z",
      },
      filter: {},
      exportId: "consumption-export-test-run",
    });

    const prefix = buildConsumptionExportGcsPrefix(workspace.sId);
    const saveCalls = fileStorageMock.saveFileCalls.filter((call) =>
      call.filePath.startsWith(prefix)
    );
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].filePath).toBe(
      `${prefix}consumption-export-test-run.zip`
    );
    expect(saveCalls[0].contentType).toBe("application/zip");

    // Read back the exact buffer passed to `.save()` rather than round-tripping through the
    // mock's in-memory object store, which stores content as a UTF-8 string and would corrupt
    // this binary zip.
    const content = saveCalls[0].content;
    const zip = new AdmZip(
      Buffer.isBuffer(content) ? content : Buffer.from(content)
    );
    expect(zip.getEntries().map((entry) => entry.entryName)).toEqual([
      "lines.csv",
    ]);

    const csv = zip.getEntry("lines.csv")?.getData().toString("utf-8");
    expect(csv).toContain(
      "completedAt,conversationId,spaceId,agentMessageId,consumptionType,agentId,agentName"
    );
    expect(csv).toContain(
      "2026-08-01T00:00:00.000Z,conv1,space1,msg1,llm,agent1,'@dust"
    );
    expect(csv).toContain("claude-sonnet-5,Claude Sonnet 5");
    expect(csv).toContain("user1,Alice,group1,Engineering");
    expect(csv).toContain(
      "2026-08-01T00:00:00.000Z,conv1,space1,msg1,tool,agent1,'@dust"
    );
    expect(csv).toContain("search,server1,Search Tool");
    expect(csv).toContain("skill1,Research");

    expect(notifyConsumptionExportReady).toHaveBeenCalledTimes(1);
  });

  it("throws and uploads nothing when the search fails", async () => {
    mockedSearchConsumptionAnalytics.mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { authenticator, workspace } = await setup();

    await expect(
      runConsumptionExportActivity(authenticator.toJSON(), {
        period: {
          startDate: "2026-08-01T00:00:00.000Z",
          endDate: "2026-08-02T00:00:00.000Z",
        },
        filter: {},
        exportId: "consumption-export-test-run",
      })
    ).rejects.toThrow();

    const prefix = buildConsumptionExportGcsPrefix(workspace.sId);
    const saveCalls = fileStorageMock.saveFileCalls.filter((call) =>
      call.filePath.startsWith(prefix)
    );
    expect(saveCalls).toHaveLength(0);
    expect(notifyConsumptionExportReady).not.toHaveBeenCalled();
  });
});
