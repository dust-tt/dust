import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteByQuery: vi.fn(),
  update: vi.fn(),
  bulk: vi.fn(),
}));

vi.mock("@app/lib/api/elasticsearch", async () => {
  const { Err, Ok } = await import("@app/types/shared/result");
  const { ElasticsearchError } = await vi.importActual<
    typeof import("@app/lib/api/elasticsearch")
  >("@app/lib/api/elasticsearch");

  return {
    AGENT_SEARCH_ALIAS_NAME: "front.agents",
    ElasticsearchError,
    withEs: async (
      fn: (client: typeof mocks) => Promise<unknown>
    ): Promise<unknown> => {
      try {
        return new Ok(await fn(mocks));
      } catch (error) {
        return new Err(error);
      }
    },
  };
});

import {
  deleteAgentDocument,
  deleteWorkspaceAgentDocuments,
  indexAgentDocument,
  updateAgentSearchActiveUsers,
} from "@app/lib/agent_search";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";

const document: AgentSearchDocument = {
  workspace_id: "workspace-1",
  agent_id: "agent-1",
  status: "active",
  scope: "visible",
  name: "Agent",
  picture_url: "https://dust.tt/static/agent.png",
  last_edited_by_user_id: null,
  requested_space_ids: [],
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  description: "Description",
  skill_ids: [],
  tool_ids: [],
  tag_ids: [],
  feedback_positive_count: 3,
  feedback_negative_count: 1,
  active_users_count: 7,
  favorite_count: 5,
  editor_ids: ["user-id"],
};

describe("agent search indexing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteByQuery.mockResolvedValue({
      failures: [],
      timed_out: false,
      version_conflicts: 0,
    });
  });

  it("scopes upserts by workspace and preserves existing daily usage", async () => {
    await indexAgentDocument(document);

    const { active_users_count, ...resourceFields } = document;
    expect(mocks.update).toHaveBeenCalledWith({
      index: "front.agents",
      id: "workspace-1_agent-1",
      doc: resourceFields,
      upsert: { ...resourceFields, active_users_count },
      retry_on_conflict: 3,
    });
  });

  it("updates daily usage, resets unused agents, and never upserts", async () => {
    mocks.bulk.mockResolvedValue({
      items: [
        { update: { status: 200 } },
        { update: { error: { type: "document_missing_exception" } } },
      ],
    });
    const result = await updateAgentSearchActiveUsers({
      workspaceId: "workspace-1",
      agentIds: ["agent-1", "agent-2"],
      activeUsers: { "agent-1": 4 },
    });
    expect(result.isOk()).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledWith({
      operations: [
        {
          update: {
            _index: "front.agents",
            _id: "workspace-1_agent-1",
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users_count: 4 } },
        {
          update: {
            _index: "front.agents",
            _id: "workspace-1_agent-2",
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users_count: 0 } },
      ],
    });
  });

  it("updates all 600 agents in one bulk request", async () => {
    mocks.bulk.mockResolvedValue({ items: [] });
    const agentIds = Array.from({ length: 600 }, (_, i) => `agent-${i}`);
    const result = await updateAgentSearchActiveUsers({
      workspaceId: "workspace-1",
      agentIds,
      activeUsers: {},
    });

    expect(result.isOk()).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledTimes(1);
    expect(mocks.bulk).toHaveBeenCalledWith({
      operations: agentIds.flatMap((agentId) => [
        {
          update: {
            _index: "front.agents",
            _id: `workspace-1_${agentId}`,
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users_count: 0 } },
      ]),
    });
  });

  it("skips bulk writes when there are no agents", async () => {
    const result = await updateAgentSearchActiveUsers({
      workspaceId: "workspace-1",
      agentIds: [],
      activeUsers: {},
    });
    expect(result.isOk()).toBe(true);
    expect(mocks.bulk).not.toHaveBeenCalled();
  });

  it("propagates usage failures for retry", async () => {
    mocks.bulk.mockResolvedValueOnce({
      items: [
        { update: { status: 200 } },
        { update: { error: { type: "version_conflict_engine_exception" } } },
      ],
    });
    const result = await updateAgentSearchActiveUsers({
      workspaceId: "workspace-1",
      agentIds: ["agent-1", "agent-2"],
      activeUsers: {},
    });
    expect(result.isErr()).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledTimes(1);
  });

  it("scopes single-agent deletion by workspace and agent", async () => {
    await deleteAgentDocument({
      workspaceId: "workspace-1",
      agentId: "agent-1",
    });

    expect(mocks.deleteByQuery).toHaveBeenCalledWith({
      index: "front.agents",
      query: {
        bool: {
          filter: [
            { term: { workspace_id: "workspace-1" } },
            { term: { agent_id: "agent-1" } },
          ],
        },
      },
      refresh: false,
    });
  });

  it("scopes workspace deletion by workspace", async () => {
    await deleteWorkspaceAgentDocuments({ workspaceId: "workspace-1" });

    expect(mocks.deleteByQuery).toHaveBeenCalledWith({
      index: "front.agents",
      query: { term: { workspace_id: "workspace-1" } },
      refresh: false,
    });
  });

  it("propagates client errors for agent and workspace deletion", async () => {
    mocks.deleteByQuery.mockRejectedValue(new Error("Deletion failed"));

    const agentResult = await deleteAgentDocument({
      workspaceId: "workspace-1",
      agentId: "agent-1",
    });
    const workspaceResult = await deleteWorkspaceAgentDocuments({
      workspaceId: "workspace-1",
    });

    expect(agentResult.isErr()).toBe(true);
    expect(workspaceResult.isErr()).toBe(true);
  });
});
