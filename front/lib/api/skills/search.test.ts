import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findGlobalSkills: vi.fn(),
  findSystemSkills: vi.fn(),
  searchSkillDocuments: vi.fn(),
}));

vi.mock("@app/lib/resources/skill/code_defined/global_registry", () => ({
  GlobalSkillsRegistry: { findAll: mocks.findGlobalSkills },
}));
vi.mock("@app/lib/resources/skill/code_defined/system_registry", () => ({
  SystemSkillsRegistry: { findAll: mocks.findSystemSkills },
}));
vi.mock("@app/lib/skill_search/search", () => ({
  MAX_SKILL_SEARCH_RESULTS: 150,
  searchSkillDocuments: mocks.searchSkillDocuments,
}));

import { searchSkillsForCommandMenu } from "@app/lib/api/skills/search";
import type { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

const customSkillDocument: SkillSearchDocument = {
  workspace_id: "workspace",
  skill_id: "custom-skill",
  status: "active",
  availability: "workspace_users",
  name: "Custom Skill",
  user_facing_description: "Custom description",
  icon: null,
  edited_by: 123,
  editor_user_ids: [123],
  requested_space_ids: ["space"],
  non_pod_space_ids: ["space"],
  non_pod_space_count: 1,
  pod_space_id: null,
  updated_at: "2026-08-01T00:00:00.000Z",
};

describe("searchSkillsForCommandMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findGlobalSkills.mockResolvedValue([
      {
        sId: "global-skill",
        icon: "ActionGlobeAltIcon",
        name: "Global Skill",
        userFacingDescription: "Global description",
      },
    ]);
    mocks.findSystemSkills.mockResolvedValue([
      {
        sId: "system-skill",
        icon: "ActionRobotIcon",
        name: "System Skill",
        userFacingDescription: "System description",
      },
    ]);
    mocks.searchSkillDocuments.mockResolvedValue(new Ok([customSkillDocument]));
  });

  it("returns minimal custom hits and every allowed code-defined skill", async () => {
    const auth = {} as Authenticator;
    const result = await searchSkillsForCommandMenu(auth, {
      searchTerm: "alias-only query",
    });

    expect(mocks.searchSkillDocuments).toHaveBeenCalledWith(auth, {
      searchTerm: "alias-only query",
      limit: 150,
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual([
      {
        editedBy: 123,
        icon: null,
        name: "Custom Skill",
        requestedSpaceIds: ["space"],
        sId: "custom-skill",
        userFacingDescription: "Custom description",
      },
      {
        editedBy: null,
        icon: "ActionGlobeAltIcon",
        name: "Global Skill",
        requestedSpaceIds: [],
        sId: "global-skill",
        userFacingDescription: "Global description",
      },
      {
        editedBy: null,
        icon: "ActionRobotIcon",
        name: "System Skill",
        requestedSpaceIds: [],
        sId: "system-skill",
        userFacingDescription: "System description",
      },
    ]);
  });
});
