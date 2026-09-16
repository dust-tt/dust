import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteByQuery: vi.fn(),
  update: vi.fn(),
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
  deleteWorkspaceSkillDocuments,
  indexSkillDocument,
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

  it("scopes workspace deletion by workspace", async () => {
    await deleteWorkspaceSkillDocuments({ workspaceId: "workspace-1" });

    expect(mocks.deleteByQuery).toHaveBeenCalledWith({
      index: "front.skills",
      query: { term: { workspace_id: "workspace-1" } },
      refresh: false,
    });
  });

  it("propagates client errors for workspace deletion", async () => {
    mocks.deleteByQuery.mockRejectedValue(new Error("Deletion failed"));

    const workspaceResult = await deleteWorkspaceSkillDocuments({
      workspaceId: "workspace-1",
    });

    expect(workspaceResult.isErr()).toBe(true);
  });
});
