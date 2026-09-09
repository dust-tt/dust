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
  edited_by: null,
  editor_user_ids: [1],
  requested_space_ids: [],
  tools: [],
  active_users: 0,
  favorite_count: 0,
  is_default: false,
  updated_at: "2026-08-01T00:00:00.000Z",
  metadata: {
    createdAt: Date.parse("2026-08-01T00:00:00Z"),
    agentFacingDescription: "Description",
    source: "web_app",
    sourceMetadata: null,
    reinforcement: "auto",
    selfImprovementLock: false,
    selfImprovementCostsCapMicroUsd: null,
    selfImprovementCostsCapAwuCredits: null,
  },
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

    const { active_users, ...resourceFields } = document;
    expect(mocks.update).toHaveBeenCalledWith({
      index: "front.skills",
      id: "workspace-1_skill-1",
      doc: resourceFields,
      upsert: { ...resourceFields, active_users },
      retry_on_conflict: 3,
    });
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

  it("updates daily usage in batches, resets unused skills, and never upserts", async () => {
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
        { doc: { active_users: 4 } },
        {
          update: {
            _index: "front.skills",
            _id: "workspace-1_skill-2",
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users: 0 } },
      ],
    });
  });

  it("propagates daily usage bulk failures for retry", async () => {
    mocks.bulk.mockResolvedValue({
      items: [
        { update: { error: { type: "version_conflict_engine_exception" } } },
      ],
    });
    const result = await updateSkillSearchActiveUsers({
      workspaceId: "workspace-1",
      skillIds: ["skill-1"],
      activeUsers: {},
    });
    expect(result.isErr()).toBe(true);
  });

  it("scopes workspace deletion by workspace", async () => {
    await deleteWorkspaceSkillDocuments({ workspaceId: "workspace-1" });

    expect(mocks.deleteByQuery).toHaveBeenCalledWith({
      index: "front.skills",
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
