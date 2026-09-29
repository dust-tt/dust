import { makeAgentDocumentId } from "@app/lib/agent_search";
import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import { reindexGlobalAgents } from "@app/lib/agent_search/index_global";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { listDefaultGlobalAgentIds } from "@app/lib/api/assistant/global_agents/global_agents";
import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ping: vi.fn(),
  bulk: vi.fn(),
  deleteByQuery: vi.fn(),
}));

vi.mock("@elastic/elasticsearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@elastic/elasticsearch")>()),
  Client: vi.fn(function () {
    return mocks;
  }),
}));

describe("reindexGlobalAgents", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(config, "getElasticsearchConfig").mockReturnValue({
      url: "http://localhost:9200",
      username: "test",
      password: "test",
    });
    mocks.ping.mockResolvedValue(true);
    mocks.bulk.mockResolvedValue({ errors: false });
    mocks.deleteByQuery.mockResolvedValue({ deleted: 1 });
  });

  it("upserts all default global agents with stable IDs before pruning only obsolete global documents", async () => {
    const agentIds = listDefaultGlobalAgentIds();
    const result = await reindexGlobalAgents();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ indexed: agentIds.length, deleted: 1 });
    }
    expect(mocks.bulk).toHaveBeenCalledExactlyOnceWith({
      require_alias: true,
      operations: agentIds.flatMap((agentId) => {
        const metadata = getGlobalAgentMetadata(agentId);
        return [
          {
            index: {
              _index: "front.agents",
              _id: makeAgentDocumentId({
                workspaceId: GLOBAL_AGENTS_WORKSPACE_ID,
                agentId,
              }),
            },
          },
          {
            workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
            agent_id: agentId,
            status: "active",
            scope: "global",
            model: null,
            name: metadata.name,
            description: metadata.description,
            picture_url: metadata.pictureUrl,
            last_edited_by_user_id: null,
            editor_ids: [],
            requested_space_ids: [],
            skill_ids: [],
            mcp_server_view_ids: [],
            tag_ids: [],
            feedback_positive_count: 0,
            feedback_negative_count: 0,
            active_users_count: null,
            favorite_count: 0,
            created_at: null,
            updated_at: null,
          },
        ];
      }),
    });
    expect(mocks.bulk).toHaveBeenCalledBefore(mocks.deleteByQuery);
    expect(mocks.deleteByQuery).toHaveBeenCalledExactlyOnceWith({
      index: "front.agents",
      query: {
        bool: {
          filter: [{ term: { workspace_id: GLOBAL_AGENTS_WORKSPACE_ID } }],
          must_not: [{ terms: { agent_id: agentIds } }],
        },
      },
    });

    await reindexGlobalAgents();
    expect(mocks.bulk.mock.calls[1]).toEqual(mocks.bulk.mock.calls[0]);
  });

  it("does not prune when bulk indexing has partial failures", async () => {
    const failedItem = {
      index: {
        _id: "global_dust",
        status: 400,
        error: {
          type: "mapper_parsing_exception",
          reason: "Failed to parse field [name]",
        },
      },
    };
    mocks.bulk.mockResolvedValue({
      errors: true,
      items: [{ index: { _id: "global_helper", status: 201 } }, failedItem],
    });
    const logError = vi.spyOn(logger, "error");

    const result = await reindexGlobalAgents();

    expect(result.isErr()).toBe(true);
    expect(mocks.deleteByQuery).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledExactlyOnceWith(
      { errors: [failedItem] },
      "Failed to index global agents."
    );
  });

  it("does not prune when Elasticsearch rejects indexing", async () => {
    mocks.bulk.mockRejectedValue(new Error("Index unavailable"));

    const result = await reindexGlobalAgents();

    expect(result.isErr()).toBe(true);
    expect(mocks.deleteByQuery).not.toHaveBeenCalled();
  });

  it.each([
    { timed_out: true },
    { failures: [{ cause: { type: "version_conflict_engine_exception" } }] },
  ])("reports incomplete cleanup: %j", async (response) => {
    mocks.deleteByQuery.mockResolvedValue(response);

    const result = await reindexGlobalAgents();

    expect(result.isErr()).toBe(true);
  });
});
