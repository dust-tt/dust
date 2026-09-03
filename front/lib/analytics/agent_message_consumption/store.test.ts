import { upsertAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/store";
import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  ElasticsearchError,
  withEs,
} from "@app/lib/api/elasticsearch";
import { USAGE_TYPE_USER } from "@app/lib/metronome/constants";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Client } from "@elastic/elasticsearch";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, withEs: vi.fn() };
});

const client = new Client({ node: "http://localhost:9200" });
const bulkMock = vi.spyOn(client, "bulk");

function makeDocument(): AgentMessageConsumptionAnalyticsData {
  return {
    agent: {
      attributed_id: "agent_1",
      id: "agent_1",
      version: "1",
      tag_ids: [],
      parent_ids: [],
      direct_parent_id: null,
      root_id: "agent_1",
      depth: 0,
    },
    agent_message_id: "agent_message_1",
    api_key_name: null,
    attribution_version: 4,
    completed_at: "2026-08-07T12:00:00.000Z",
    consumption_key: "run-usage:1",
    consumption_type: "llm",
    context_origin: "web",
    normalized_origin: "web",
    conversation_id: "conversation_1",
    credit_micro: 1_000_000,
    execution_time_ms: null,
    parent_message_id: null,
    gross_credit_micro: {
      system: 0,
      input: 600_000,
      result_footprint: null,
      output: 400_000,
      reasoning: 0,
      direct: 0,
      total: 1_000_000,
    },
    message_version: "2",
    model: null,
    run_usage_id: "1",
    space_id: null,
    status: "succeeded",
    step_index: 0,
    tokens: {
      system: 0,
      input: 10,
      result_footprint: null,
      output: 5,
      reasoning: 0,
    },
    tool: null,
    trigger_id: null,
    usage_type: USAGE_TYPE_USER,
    user: null,
    workspace_id: "workspace_1",
  };
}

describe("upsertAgentMessageConsumptionAnalyticsDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bulkMock.mockResolvedValue({ errors: false, items: [], took: 1 });
    vi.mocked(withEs).mockImplementation(async (fn) => {
      try {
        return new Ok(await fn(client));
      } catch (error) {
        return new Err(
          new ElasticsearchError("query_error", normalizeError(error).message)
        );
      }
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it("uses a stable identity for idempotent upserts", async () => {
    const document = makeDocument();

    const result = await upsertAgentMessageConsumptionAnalyticsDocuments([
      document,
    ]);

    expect(result.isOk()).toBe(true);
    expect(bulkMock).toHaveBeenCalledWith({
      body: [
        {
          index: {
            _index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
            _id: "workspace_1_agent_message_1_run-usage:1",
          },
        },
        document,
      ],
      refresh: false,
    });
  });

  it("does nothing when there are no documents", async () => {
    const result = await upsertAgentMessageConsumptionAnalyticsDocuments([]);

    expect(result.isOk()).toBe(true);
    expect(withEs).not.toHaveBeenCalled();
  });

  it("returns the Elasticsearch error when the request fails", async () => {
    const error = new ElasticsearchError("connection_error", "write failed");
    vi.mocked(withEs).mockResolvedValueOnce(new Err(error));

    const result = await upsertAgentMessageConsumptionAnalyticsDocuments([
      makeDocument(),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });

  it("returns the error from a failed bulk item", async () => {
    bulkMock.mockResolvedValueOnce({
      errors: true,
      items: [
        {
          index: {
            _index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
            status: 429,
            error: {
              type: "es_rejected_execution_exception",
              reason: "queue full",
            },
          },
        },
      ],
      took: 1,
    });

    const result = await upsertAgentMessageConsumptionAnalyticsDocuments([
      makeDocument(),
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("queue full");
      expect(result.error.statusCode).toBe(429);
    }
  });
});
