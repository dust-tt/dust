import { replaceAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/store";
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
const deleteByQueryMock = vi.spyOn(client, "deleteByQuery");
const bulkMock = vi.spyOn(client, "bulk");

function makeDocument({
  agentMessageId = "agent_message_1",
  consumptionKey = "run-usage:1",
  messageVersion = "0",
  workspaceId = "workspace_1",
}: {
  agentMessageId?: string;
  consumptionKey?: string;
  messageVersion?: string;
  workspaceId?: string;
} = {}): AgentMessageConsumptionAnalyticsData {
  return {
    agent: {
      id: "agent_1",
      version: "1",
      tag_ids: [],
      parent_ids: [],
      direct_parent_id: null,
      root_id: "agent_1",
      depth: 0,
    },
    agent_message_id: agentMessageId,
    api_key_name: null,
    attribution_version: 4,
    completed_at: "2026-08-07T12:00:00.000Z",
    consumption_key: consumptionKey,
    consumption_type: "llm",
    context_origin: "web",
    conversation_id: "conversation_1",
    credit_micro: 1_000_000,
    execution_time_ms: null,
    gross_credit_micro: {
      system: 0,
      input: 600_000,
      result_footprint: null,
      output: 400_000,
      reasoning: 0,
      direct: 0,
      total: 1_000_000,
    },
    message_version: messageVersion,
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
    workspace_id: workspaceId,
  };
}

describe("replaceAgentMessageConsumptionAnalyticsDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteByQueryMock.mockResolvedValue({
      failures: [],
      version_conflicts: 0,
    });
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

  it("deletes the previous message snapshot before indexing the replacement", async () => {
    const document = makeDocument({ messageVersion: "2" });

    await replaceAgentMessageConsumptionAnalyticsDocuments({
      agentMessageId: document.agent_message_id,
      documents: [document],
      workspaceId: document.workspace_id,
    });

    expect(deleteByQueryMock).toHaveBeenCalledWith({
      index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
      query: {
        bool: {
          filter: [
            { term: { workspace_id: document.workspace_id } },
            { term: { agent_message_id: document.agent_message_id } },
          ],
        },
      },
      refresh: false,
    });
    expect(bulkMock).toHaveBeenCalledWith({
      body: [
        {
          index: {
            _index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
            _id: "workspace_1_agent_message_1_2_run-usage:1",
          },
        },
        document,
      ],
      refresh: "wait_for",
    });
    expect(deleteByQueryMock.mock.invocationCallOrder[0]).toBeLessThan(
      bulkMock.mock.invocationCallOrder[0] ?? 0
    );
  });

  it("deletes the previous snapshot when the replacement is empty", async () => {
    await replaceAgentMessageConsumptionAnalyticsDocuments({
      agentMessageId: "agent_message_1",
      documents: [],
      workspaceId: "workspace_1",
    });

    expect(deleteByQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: true })
    );
    expect(bulkMock).not.toHaveBeenCalled();
  });

  it("rejects documents from another message", async () => {
    await expect(
      replaceAgentMessageConsumptionAnalyticsDocuments({
        agentMessageId: "agent_message_1",
        documents: [makeDocument({ agentMessageId: "agent_message_2" })],
        workspaceId: "workspace_1",
      })
    ).rejects.toThrow(
      "Consumption documents belong to different agent messages"
    );

    expect(withEs).not.toHaveBeenCalled();
  });

  it("fails the activity when Elasticsearch rejects the replacement", async () => {
    vi.mocked(withEs).mockResolvedValueOnce(
      new Err(new ElasticsearchError("query_error", "write failed"))
    );

    await expect(
      replaceAgentMessageConsumptionAnalyticsDocuments({
        agentMessageId: "agent_message_1",
        documents: [makeDocument()],
        workspaceId: "workspace_1",
      })
    ).rejects.toThrow("Failed to replace consumption analytics snapshot");
  });
});
