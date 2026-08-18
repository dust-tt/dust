// @vitest-environment node: zlib gunzip requires Node builtins (Buffer, zlib).

import { PassThrough } from "node:stream";
import zlib from "node:zlib";
import { streamConsumptionLinesExportCsvGz } from "@app/lib/api/analytics/consumption/export_lines";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import {
  closePointInTime,
  ElasticsearchError,
  openPointInTime,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type {
  AgentMessageConsumptionAnalyticsData,
  AgentMessageConsumptionAnalyticsLlmData,
} from "@app/types/assistant/analytics";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedSearchConsumptionAnalytics = vi.mocked(
  searchConsumptionAnalytics<AgentMessageConsumptionAnalyticsData>
);

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

beforeEach(() => {
  vi.mocked(openPointInTime).mockReset().mockResolvedValue(new Ok("pit-id"));
  vi.mocked(closePointInTime).mockReset().mockResolvedValue(new Ok(undefined));
});

function makeDoc(index: number): AgentMessageConsumptionAnalyticsLlmData {
  return {
    workspace_id: "w1",
    agent: {
      id: `agent${index}`,
      version: "1",
      tag_ids: [],
      parent_ids: [],
      direct_parent_id: null,
      root_id: `agent${index}`,
      depth: 0,
    },
    agent_message_id: `msg${index}`,
    api_key_name: null,
    attribution_version: 1,
    completed_at: "2026-08-01T00:00:00.000Z",
    consumption_key: `run-usage:${index}`,
    context_origin: "api",
    normalized_origin: "api",
    conversation_id: `conv${index}`,
    credit_micro: 1_000_000,
    execution_time_ms: null,
    message_version: "1",
    model: {
      provider_id: "anthropic",
      model_id: "claude-sonnet-5",
      reasoning_effort: "medium",
      resolution_method: "auto",
    },
    run_usage_id: `${index}`,
    space_id: "space1",
    status: "succeeded",
    step_index: 0,
    trigger_id: null,
    usage_type: "user",
    user: { id: "user1", group_ids: [] },
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
}

// Partitions `docs` across whatever slice count/id the caller requests, so a set of
// concurrent slice fetches (as the real ES `slice` param would) never see the same
// document twice.
function mockSlicedDocs(docs: AgentMessageConsumptionAnalyticsData[]) {
  mockedSearchConsumptionAnalytics.mockImplementation(async (_q, options) => {
    const slice = options?.slice;
    const partition = slice
      ? docs.filter((_doc, index) => index % slice.max === Number(slice.id))
      : docs;

    return new Ok({
      took: 0,
      timed_out: false,
      _shards: { failed: 0, successful: 1, total: 1 },
      hits: {
        hits: partition.map((doc) => ({
          _index: "consumption_analytics",
          _source: doc,
          sort: [],
        })),
      },
    });
  });
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

async function collect(stream: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function setup() {
  const { authenticator } = await createResourceTest({ role: "admin" });
  return { authenticator };
}

describe("streamConsumptionLinesExportCsvGz", () => {
  it("streams every document exactly once as gzip-compressed CSV", async () => {
    const docs = Array.from({ length: 5 }, (_, i) => makeDoc(i));
    mockSlicedDocs(docs);
    mockLabels({
      agent0: "@dust",
      user1: "Alice",
      "claude-sonnet-5": "Claude Sonnet 5",
      api: "API",
    });
    const { authenticator } = await setup();

    const destination = new PassThrough();
    const collected = collect(destination);

    const result = await streamConsumptionLinesExportCsvGz(
      authenticator,
      {
        period: {
          startDate: "2026-08-01T00:00:00.000Z",
          endDate: "2026-08-02T00:00:00.000Z",
        },
        filter: {},
      },
      destination
    );

    expect(result.isOk()).toBe(true);

    const gzipped = await collected;
    const csv = zlib.gunzipSync(gzipped).toString("utf-8");
    const lines = csv.trim().split("\n");

    // Header + one row per document, no duplicates from concurrent slices.
    expect(lines).toHaveLength(docs.length + 1);
    expect(lines[0]).toContain(
      "completedAt,conversationId,spaceId,agentMessageId"
    );
    expect(csv).toContain("conv0,space1,msg0,llm,agent0,'@dust");
    expect(csv).toContain("conv4,space1,msg4,llm,agent4,agent4");
    expect(csv).toContain("user1,Alice");
  });

  it("returns Err and does not resolve with a truncated file when the search fails", async () => {
    mockedSearchConsumptionAnalytics.mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { authenticator } = await setup();

    const destination = new PassThrough();
    destination.resume();

    const result = await streamConsumptionLinesExportCsvGz(
      authenticator,
      {
        period: {
          startDate: "2026-08-01T00:00:00.000Z",
          endDate: "2026-08-02T00:00:00.000Z",
        },
        filter: {},
      },
      destination
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("boom");
    }
  });
});
