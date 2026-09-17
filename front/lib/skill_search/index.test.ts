import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteByQuery: vi.fn(),
  update: vi.fn(),
  bulk: vi.fn(),
}));

vi.mock("@app/lib/api/elasticsearch", async () => {
  const { Err, Ok } = await import("@app/types/shared/result");

  return {
    SKILL_SEARCH_ALIAS_NAME: "front.skills",
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
  deleteSkillDocument,
  deleteWorkspaceSkillDocuments,
  indexSkillDocument,
  updateSkillSearchActiveUsers,
} from "@app/lib/skill_search";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

const document: SkillSearchDocument = {
  workspace_id: "workspace-1",
  skill_id: "skill-1",
  status: "active",
  availability: "workspace_users",
  name: "Skill",
  description: "Description",
  icon: null,
  last_edited_by_user_id: null,
  editor_ids: ["user-id"],
  requested_space_ids: [],
  mcp_server_view_ids: [],
  active_users_count: 0,
  favorite_count: 0,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("skill search indexing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteByQuery.mockResolvedValue({
      failures: [],
      timed_out: false,
      version_conflicts: 0,
    });
  });

  it("scopes upserts by workspace and preserves existing daily usage", async () => {
    await indexSkillDocument(document);

    const { active_users_count, ...resourceFields } = document;
    expect(mocks.update).toHaveBeenCalledWith({
      index: "front.skills",
      id: "workspace-1_skill-1",
      doc: resourceFields,
      upsert: { ...resourceFields, active_users_count },
      retry_on_conflict: 3,
    });
  });

  it("updates daily usage, resets unused skills, and never upserts", async () => {
    mocks.bulk.mockResolvedValue({
      items: [
        { update: { status: 200 } },
        { update: { error: { type: "document_missing_exception" } } },
      ],
    });
    const result = await updateSkillSearchActiveUsers({
      workspaceId: "workspace-1",
      skillIds: ["skill-1", "skill-2"],
      activeUsers: { "skill-1": 4 },
    });
    expect(result.isOk()).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledWith({
      operations: [
        {
          update: {
            _index: "front.skills",
            _id: "workspace-1_skill-1",
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users_count: 4 } },
        {
          update: {
            _index: "front.skills",
            _id: "workspace-1_skill-2",
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users_count: 0 } },
      ],
    });
  });

  it("updates all 600 skills in one bulk request", async () => {
    mocks.bulk.mockResolvedValue({ items: [] });
    const skillIds = Array.from({ length: 600 }, (_, i) => `skill-${i}`);
    const result = await updateSkillSearchActiveUsers({
      workspaceId: "workspace-1",
      skillIds,
      activeUsers: {},
    });

    expect(result.isOk()).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledTimes(1);
    expect(mocks.bulk).toHaveBeenCalledWith({
      operations: skillIds.flatMap((skillId) => [
        {
          update: {
            _index: "front.skills",
            _id: `workspace-1_${skillId}`,
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users_count: 0 } },
      ]),
    });
  });

  it("skips bulk writes when there are no custom skills", async () => {
    const result = await updateSkillSearchActiveUsers({
      workspaceId: "workspace-1",
      skillIds: [],
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
    const result = await updateSkillSearchActiveUsers({
      workspaceId: "workspace-1",
      skillIds: ["skill-1", "skill-2"],
      activeUsers: {},
    });
    expect(result.isErr()).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledTimes(1);
  });

  it("scopes single-skill deletion by workspace and skill", async () => {
    await deleteSkillDocument({
      workspaceId: "workspace-1",
      skillId: "skill-1",
    });

    expect(mocks.deleteByQuery).toHaveBeenCalledWith({
      index: "front.skills",
      query: {
        bool: {
          filter: [
            { term: { workspace_id: "workspace-1" } },
            { term: { skill_id: "skill-1" } },
          ],
        },
      },
      refresh: false,
    });
  });

  it("scopes workspace deletion by workspace", async () => {
    await deleteWorkspaceSkillDocuments({ workspaceId: "workspace-1" });

    expect(mocks.deleteByQuery).toHaveBeenCalledWith({
      index: "front.skills",
      query: { term: { workspace_id: "workspace-1" } },
      refresh: false,
    });
  });

  it("propagates client errors for skill and workspace deletion", async () => {
    mocks.deleteByQuery.mockRejectedValue(new Error("Deletion failed"));

    const skillResult = await deleteSkillDocument({
      workspaceId: "workspace-1",
      skillId: "skill-1",
    });
    const workspaceResult = await deleteWorkspaceSkillDocuments({
      workspaceId: "workspace-1",
    });

    expect(skillResult.isErr()).toBe(true);
    expect(workspaceResult.isErr()).toBe(true);
  });
});
