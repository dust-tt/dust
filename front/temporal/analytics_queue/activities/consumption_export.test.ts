// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).
// This directive makes them available in the test environment.

import {
  EXPORT_PAGE_SIZE,
  EXPORT_SLICE_COUNT,
} from "@app/lib/api/analytics/consumption/export_lines";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import {
  closePointInTime,
  ElasticsearchError,
  openPointInTime,
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
import type { estypes } from "@elastic/elasticsearch";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Instantiation expression: pins the mock to the concrete TDocument the exporter
// actually queries with, so mockResolvedValue can be given a fully-typed
// SearchResponse below without an `as` cast.
const mockedSearchConsumptionAnalytics = vi.mocked(
  searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>
);
const mockedOpenPointInTime = vi.mocked(openPointInTime);
const mockedClosePointInTime = vi.mocked(closePointInTime);

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    searchConsumptionAnalytics: vi.fn(),
    openPointInTime: vi.fn(),
    closePointInTime: vi.fn(),
  };
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

const PIT_ID = "test-pit-id";

beforeEach(() => {
  vi.mocked(notifyConsumptionExportReady).mockClear();
  mockedOpenPointInTime.mockReset().mockResolvedValue(new Ok(PIT_ID));
  mockedClosePointInTime.mockReset().mockResolvedValue(new Ok(undefined));
});

function searchResponse(
  docs: AgentMessageConsumptionAnalyticsData[],
  pitId: string = PIT_ID
): estypes.SearchResponse<AgentMessageConsumptionAnalyticsData> {
  return {
    took: 0,
    timed_out: false,
    _shards: { failed: 0, successful: 1, total: 1 },
    pit_id: pitId,
    hits: {
      hits: docs.map((doc, index) => ({
        _index: "consumption_analytics",
        _source: doc,
        sort: [doc.completed_at, doc.agent_message_id, doc.consumption_key],
        _id: `${doc.agent_message_id}-${doc.consumption_key}-${index}`,
      })),
    },
  } as estypes.SearchResponse<AgentMessageConsumptionAnalyticsData>;
}

function docWithKeys(
  base: AgentMessageConsumptionAnalyticsLlmData,
  overrides: {
    agentMessageId: string;
    consumptionKey: string;
    completedAt: string;
  }
): AgentMessageConsumptionAnalyticsLlmData {
  return {
    ...base,
    agent_message_id: overrides.agentMessageId,
    consumption_key: overrides.consumptionKey,
    completed_at: overrides.completedAt,
  };
}

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

// Routes every document to slice 0 and returns empty pages for the other slices, mirroring
// how a real ES sliced search partitions the result set (each doc belongs to exactly one slice).
function mockDocs(docs: AgentMessageConsumptionAnalyticsData[]) {
  mockedSearchConsumptionAnalytics.mockImplementation(
    async (_query, options) => {
      const isFirstSlice = options?.slice?.id === "0";
      return new Ok(searchResponse(isFirstSlice ? docs : []));
    }
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

  it("opens a single point-in-time, reuses it across every slice, and closes it once", async () => {
    mockDocs([LLM_DOC]);
    mockLabels({});
    const { authenticator } = await setup();

    await runConsumptionExportActivity(authenticator.toJSON(), {
      period: {
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-02T00:00:00.000Z",
      },
      filter: {},
      exportId: "consumption-export-test-run",
    });

    expect(mockedOpenPointInTime).toHaveBeenCalledTimes(1);
    expect(mockedClosePointInTime).toHaveBeenCalledTimes(1);
    expect(mockedClosePointInTime).toHaveBeenCalledWith(PIT_ID);

    const sliceIdsQueried = mockedSearchConsumptionAnalytics.mock.calls.map(
      ([, options]) => options?.slice?.id
    );
    expect(new Set(sliceIdsQueried)).toEqual(
      new Set(Array.from({ length: EXPORT_SLICE_COUNT }, (_, id) => String(id)))
    );
    for (const [, options] of mockedSearchConsumptionAnalytics.mock.calls) {
      expect(options?.pit?.id).toBe(PIT_ID);
    }
  });

  it("closes the point-in-time even when a slice fails", async () => {
    mockedSearchConsumptionAnalytics.mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { authenticator } = await setup();

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

    expect(mockedClosePointInTime).toHaveBeenCalledTimes(1);
    expect(mockedClosePointInTime).toHaveBeenCalledWith(PIT_ID);
  });

  it("partitions documents across slices without duplicating or dropping rows", async () => {
    // Each slice owns a disjoint subset of documents, as a real ES sliced search would.
    const docs = Array.from({ length: EXPORT_SLICE_COUNT * 3 }, (_, index) =>
      docWithKeys(LLM_DOC, {
        agentMessageId: `msg-${index}`,
        consumptionKey: `run-usage:${index}`,
        completedAt: `2026-08-01T00:00:${String(index).padStart(2, "0")}.000Z`,
      })
    );
    mockedSearchConsumptionAnalytics.mockImplementation(
      async (_query, options) => {
        const sliceId = Number(options?.slice?.id ?? 0);
        const sliceDocs = docs.filter(
          (_doc, index) => index % EXPORT_SLICE_COUNT === sliceId
        );
        return new Ok(searchResponse(sliceDocs));
      }
    );
    mockLabels({});
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
    const content = saveCalls[0].content;
    const zip = new AdmZip(
      Buffer.isBuffer(content) ? content : Buffer.from(content)
    );
    const csv = zip.getEntry("lines.csv")?.getData().toString("utf-8") ?? "";
    const dataRows = csv.trim().split("\n").slice(1);

    expect(dataRows).toHaveLength(docs.length);
    const agentMessageIdColumn = 3;
    const rowAgentMessageIds = dataRows.map(
      (row) => row.split(",")[agentMessageIdColumn]
    );
    for (const doc of docs) {
      expect(
        rowAgentMessageIds.filter((id) => id === doc.agent_message_id)
      ).toHaveLength(1);
    }

    // Rows must come back in global completedAt order, not grouped by slice.
    const completedAts = dataRows.map((row) => row.split(",")[0]);
    expect(completedAts).toEqual([...completedAts].sort());
  });

  it("paginates within a slice using search_after until a short page ends it", async () => {
    const fullPageDocs = Array.from({ length: EXPORT_PAGE_SIZE }, (_, index) =>
      docWithKeys(LLM_DOC, {
        agentMessageId: `page1-${index}`,
        consumptionKey: `run-usage:${index}`,
        completedAt: "2026-08-01T00:00:00.000Z",
      })
    );
    const lastPageDoc = docWithKeys(LLM_DOC, {
      agentMessageId: "page2-0",
      consumptionKey: "run-usage:last",
      completedAt: "2026-08-01T00:00:01.000Z",
    });

    mockedSearchConsumptionAnalytics.mockImplementation(
      async (_query, options) => {
        if (options?.slice?.id !== "0") {
          return new Ok(searchResponse([]));
        }
        // The exporter paginates with search_after: the first call has none, the
        // second must carry the sort tuple of the last row of the first page.
        return new Ok(
          searchResponse(options.search_after ? [lastPageDoc] : fullPageDocs)
        );
      }
    );
    mockLabels({});
    const { authenticator, workspace } = await setup();

    await runConsumptionExportActivity(authenticator.toJSON(), {
      period: {
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-02T00:00:00.000Z",
      },
      filter: {},
      exportId: "consumption-export-test-run",
    });

    const sliceZeroCalls = mockedSearchConsumptionAnalytics.mock.calls.filter(
      ([, options]) => options?.slice?.id === "0"
    );
    const lastDocOfFirstPage = fullPageDocs[fullPageDocs.length - 1];
    expect(sliceZeroCalls).toHaveLength(2);
    expect(sliceZeroCalls[1][1]?.search_after).toEqual([
      lastDocOfFirstPage.completed_at,
      lastDocOfFirstPage.agent_message_id,
      lastDocOfFirstPage.consumption_key,
    ]);

    const prefix = buildConsumptionExportGcsPrefix(workspace.sId);
    const saveCalls = fileStorageMock.saveFileCalls.filter((call) =>
      call.filePath.startsWith(prefix)
    );
    const content = saveCalls[0].content;
    const zip = new AdmZip(
      Buffer.isBuffer(content) ? content : Buffer.from(content)
    );
    const csv = zip.getEntry("lines.csv")?.getData().toString("utf-8") ?? "";
    const dataRows = csv.trim().split("\n").slice(1);
    expect(dataRows).toHaveLength(fullPageDocs.length + 1);
  });

  it("coordinates a single, latest PIT id across all slices and closes only that id", async () => {
    const PIT_ID_V2 = "test-pit-id-v2";
    const fullPageDocs = Array.from({ length: EXPORT_PAGE_SIZE }, (_, index) =>
      docWithKeys(LLM_DOC, {
        agentMessageId: `page1-${index}`,
        consumptionKey: `run-usage:${index}`,
        completedAt: "2026-08-01T00:00:00.000Z",
      })
    );
    const lastPageDoc = docWithKeys(LLM_DOC, {
      agentMessageId: "page2-0",
      consumptionKey: "run-usage:last",
      completedAt: "2026-08-01T00:00:01.000Z",
    });

    // Simulates ES refreshing the PIT id on the very first round: every slice's first
    // request still targets the id from openPointInTime, but every response (including
    // the empty ones from already-exhausted slices) carries the refreshed id forward.
    mockedSearchConsumptionAnalytics.mockImplementation(
      async (_query, options) => {
        const isFirstSlice = options?.slice?.id === "0";
        if (!isFirstSlice) {
          return new Ok(searchResponse([], PIT_ID_V2));
        }
        return new Ok(
          searchResponse(
            options.search_after ? [lastPageDoc] : fullPageDocs,
            PIT_ID_V2
          )
        );
      }
    );
    mockLabels({});
    const { authenticator } = await setup();

    await runConsumptionExportActivity(authenticator.toJSON(), {
      period: {
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-02T00:00:00.000Z",
      },
      filter: {},
      exportId: "consumption-export-test-run",
    });

    // Slice 0 needs a second round (search_after) since its first page was full; that
    // round must use the refreshed PIT id rather than the original one.
    const sliceZeroCalls = mockedSearchConsumptionAnalytics.mock.calls.filter(
      ([, options]) => options?.slice?.id === "0"
    );
    expect(sliceZeroCalls).toHaveLength(2);
    expect(sliceZeroCalls[0][1]?.pit?.id).toBe(PIT_ID);
    expect(sliceZeroCalls[1][1]?.pit?.id).toBe(PIT_ID_V2);

    // The other slices only need one round, and it must use the original PIT id since
    // the refresh only surfaces once slice 0's first response comes back.
    const otherSliceCalls = mockedSearchConsumptionAnalytics.mock.calls.filter(
      ([, options]) => options?.slice?.id !== "0"
    );
    expect(otherSliceCalls.length).toBeGreaterThan(0);
    for (const [, options] of otherSliceCalls) {
      expect(options?.pit?.id).toBe(PIT_ID);
    }

    // The final close must target the latest coordinated id, not the one PIT was opened with.
    expect(mockedClosePointInTime).toHaveBeenCalledTimes(1);
    expect(mockedClosePointInTime).toHaveBeenCalledWith(PIT_ID_V2);
  });
});
