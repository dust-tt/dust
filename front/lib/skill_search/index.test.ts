import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteByQuery: vi.fn(),
  index: vi.fn(),
}));

vi.mock("@app/lib/api/elasticsearch", async () => {
  const { Err, Ok } = await import("@app/types/shared/result");

  return {
    SKILL_SEARCH_ALIAS_NAME: "front.skill_search",
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
} from "@app/lib/skill_search";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

const document: SkillSearchDocument = {
  workspace_id: "workspace-1",
  skill_id: "skill-1",
  status: "active",
  availability: "workspace_users",
  name: "Skill",
  user_facing_description: "Description",
  icon: null,
  edited_by: null,
  editor_user_ids: [1],
  requested_space_ids: [],
  non_pod_space_ids: [],
  non_pod_space_count: 0,
  pod_space_id: null,
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

  it("includes the workspace in indexed documents and IDs", async () => {
    await indexSkillDocument(document);

    expect(mocks.index).toHaveBeenCalledWith({
      index: "front.skill_search",
      id: "workspace-1_skill-1",
      body: document,
    });
  });

  it("scopes single-skill deletion by workspace and skill", async () => {
    await deleteSkillDocument({
      workspaceId: "workspace-1",
      skillId: "skill-1",
    });

    expect(mocks.deleteByQuery).toHaveBeenCalledWith({
      index: "front.skill_search",
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
      index: "front.skill_search",
      query: { term: { workspace_id: "workspace-1" } },
      refresh: false,
    });
  });

  it.each([
    ["a timeout", { timed_out: true }],
    ["a failure", { failures: [{}] }],
    ["a version conflict", { version_conflicts: 1 }],
  ])("reports %s as an incomplete deletion", async (_label, response) => {
    mocks.deleteByQuery.mockResolvedValueOnce(response);

    const result = await deleteSkillDocument({
      workspaceId: "workspace-1",
      skillId: "skill-1",
    });

    expect(result.isErr()).toBe(true);
  });
});
