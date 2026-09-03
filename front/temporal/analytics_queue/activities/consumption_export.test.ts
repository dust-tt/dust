import { listConsumptionExports } from "@app/lib/api/analytics/consumption/export_jobs";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { getTmpWorkloadsBucket } from "@app/lib/file_storage";
import { notifyConsumptionExportReady } from "@app/lib/notifications/workflows/consumption-export-ready";
import {
  buildConsumptionExportBucketPartsGcsPrefix,
  buildConsumptionExportGcsPrefix,
  finalizeConsumptionExportActivity,
  runConsumptionExportBucketActivity,
} from "@app/temporal/analytics_queue/activities/consumption_export";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import type {
  AgentMessageConsumptionAnalyticsData,
  AgentMessageConsumptionAnalyticsLlmData,
  AgentMessageConsumptionAnalyticsToolData,
} from "@app/types/assistant/analytics";
import { Err, Ok } from "@app/types/shared/result";
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
    attributed_id: "agent1",
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
  parent_message_id: null,
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
  mockedSearchConsumptionAnalytics.mockResolvedValueOnce(
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

const PERIOD = {
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2026-08-01T06:00:00.000Z",
};

describe("runConsumptionExportBucketActivity", () => {
  it("uploads the bucket's rows as a headerless CSV part", async () => {
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

    await runConsumptionExportBucketActivity(authenticator.toJSON(), {
      period: PERIOD,
      filter: {},
      exportId: "consumption-export-test-run",
      bucketIndex: 0,
    });

    const tmpPrefix = buildConsumptionExportBucketPartsGcsPrefix(
      workspace.sId,
      "consumption-export-test-run"
    );
    const saveCalls = fileStorageMock.saveFileCalls.filter((call) =>
      call.filePath.startsWith(tmpPrefix)
    );
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].filePath).toBe(`${tmpPrefix}0.csv`);
    expect(saveCalls[0].contentType).toBe("text/csv");

    // A bucket part must never live under the prefix `listConsumptionExports` scans,
    // or an in-progress (or abandoned-after-failure) export would show up as a broken,
    // non-downloadable entry in the UI.
    expect(
      tmpPrefix.startsWith(buildConsumptionExportGcsPrefix(workspace.sId))
    ).toBe(false);

    const csv = saveCalls[0].content.toString();
    expect(csv).not.toContain("completedAt,conversationId");
    expect(csv).toContain(
      "2026-08-01T00:00:00.000Z,conv1,space1,msg1,llm,agent1,'@dust"
    );
    expect(csv).toContain(
      "2026-08-01T00:00:00.000Z,conv1,space1,msg1,tool,agent1,'@dust"
    );

    expect(notifyConsumptionExportReady).not.toHaveBeenCalled();
  });

  it("throws and uploads nothing when the search fails", async () => {
    mockedSearchConsumptionAnalytics.mockResolvedValueOnce(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { authenticator, workspace } = await setup();

    await expect(
      runConsumptionExportBucketActivity(authenticator.toJSON(), {
        period: PERIOD,
        filter: {},
        exportId: "consumption-export-test-run",
        bucketIndex: 0,
      })
    ).rejects.toThrow();

    const tmpPrefix = buildConsumptionExportBucketPartsGcsPrefix(
      workspace.sId,
      "consumption-export-test-run"
    );
    const saveCalls = fileStorageMock.saveFileCalls.filter((call) =>
      call.filePath.startsWith(tmpPrefix)
    );
    expect(saveCalls).toHaveLength(0);
  });

  it("does not surface an in-progress or abandoned-after-failure bucket part as an export", async () => {
    mockDocs([LLM_DOC]);
    mockLabels({ agent1: "@dust", api: "API" });
    const { authenticator } = await setup();

    // Simulates a bucket having been fetched while the workflow is still running, or one
    // left behind by a workflow that failed before its finalize step ran.
    await runConsumptionExportBucketActivity(authenticator.toJSON(), {
      period: PERIOD,
      filter: {},
      exportId: "in-progress-export",
      bucketIndex: 0,
    });

    const items = await listConsumptionExports(authenticator);

    expect(items).toEqual([]);
  });
});

describe("finalizeConsumptionExportActivity", () => {
  it("composes the bucket parts into a single CSV, notifies, and cleans up the temp parts", async () => {
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
    const authType = authenticator.toJSON();
    const exportId = "consumption-export-test-run";

    mockDocs([LLM_DOC]);
    await runConsumptionExportBucketActivity(authType, {
      period: PERIOD,
      filter: {},
      exportId,
      bucketIndex: 0,
    });

    mockDocs([TOOL_DOC]);
    await runConsumptionExportBucketActivity(authType, {
      period: PERIOD,
      filter: {},
      exportId,
      bucketIndex: 1,
    });

    await finalizeConsumptionExportActivity(authType, {
      exportId,
      bucketCount: 2,
    });

    const prefix = buildConsumptionExportGcsPrefix(workspace.sId);
    const finalSaveCalls = fileStorageMock.saveFileCalls.filter(
      (call) => call.filePath === `${prefix}${exportId}.csv`
    );
    expect(finalSaveCalls).toHaveLength(1);
    expect(finalSaveCalls[0].contentType).toBe("text/csv");

    const csv = finalSaveCalls[0].content.toString();
    // Header appears exactly once, ahead of both buckets' rows, in bucket order.
    expect(csv.indexOf("completedAt,conversationId")).toBe(0);
    const llmIndex = csv.indexOf(",llm,");
    const toolIndex = csv.indexOf(",tool,");
    expect(llmIndex).toBeGreaterThan(0);
    expect(toolIndex).toBeGreaterThan(llmIndex);

    expect(notifyConsumptionExportReady).toHaveBeenCalledTimes(1);

    // The temp parts (and the header part written for the compose) are gone.
    const tmpPrefix = buildConsumptionExportBucketPartsGcsPrefix(
      workspace.sId,
      exportId
    );
    const writtenTmpPaths = fileStorageMock.saveFileCalls
      .filter((call) => call.filePath.startsWith(tmpPrefix))
      .map((call) => call.filePath);
    expect(writtenTmpPaths.length).toBeGreaterThan(0); // sanity: parts were written
    for (const path of writtenTmpPaths) {
      const [content] = await getTmpWorkloadsBucket().file(path).download();
      expect(content.toString()).toBe("");
    }
  });

  it("produces a header-only CSV when there are no buckets", async () => {
    const { authenticator, workspace } = await setup();

    await finalizeConsumptionExportActivity(authenticator.toJSON(), {
      exportId: "empty-export",
      bucketCount: 0,
    });

    const prefix = buildConsumptionExportGcsPrefix(workspace.sId);
    const finalSaveCalls = fileStorageMock.saveFileCalls.filter(
      (call) => call.filePath === `${prefix}empty-export.csv`
    );
    expect(finalSaveCalls).toHaveLength(1);

    const csv = finalSaveCalls[0].content.toString();
    expect(csv).toContain("completedAt,conversationId");
    expect(notifyConsumptionExportReady).toHaveBeenCalledTimes(1);
  });

  it("composes more than GCS_COMPOSE_MAX_SOURCES parts across multiple stages", async () => {
    const { authenticator, workspace } = await setup();
    const authType = authenticator.toJSON();
    const exportId = "many-buckets-export";
    const bucketCount = 40; // > GCS_COMPOSE_MAX_SOURCES (32) + the header part.

    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex++) {
      mockDocs([]);
      await runConsumptionExportBucketActivity(authType, {
        period: PERIOD,
        filter: {},
        exportId,
        bucketIndex,
      });
    }

    await finalizeConsumptionExportActivity(authType, {
      exportId,
      bucketCount,
    });

    const prefix = buildConsumptionExportGcsPrefix(workspace.sId);
    const finalSaveCalls = fileStorageMock.saveFileCalls.filter(
      (call) => call.filePath === `${prefix}${exportId}.csv`
    );
    expect(finalSaveCalls).toHaveLength(1);
    expect(finalSaveCalls[0].content.toString()).toContain(
      "completedAt,conversationId"
    );
  });
});
