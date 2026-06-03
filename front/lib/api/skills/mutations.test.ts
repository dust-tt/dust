import { SkillVersionModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Err, Ok } from "@app/types/shared/result";
import type { WhereOptions } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSkillIconSuggestion } = vi.hoisted(() => ({
  mockGetSkillIconSuggestion: vi.fn(),
}));

vi.mock("@app/lib/api/skills/icon_suggestion", () => ({
  getSkillIconSuggestion: mockGetSkillIconSuggestion,
}));

import { createSkill, updateSkill } from "./mutations";

describe("skill mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSkillIconSuggestion.mockResolvedValue(new Ok("ActionBrainIcon"));
  });

  it("creates an agent-sourced skill and falls back to icon suggestion", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const result = await createSkill(authenticator, {
      name: " Write Weekly Digest ",
      agentFacingDescription: "Use when drafting a weekly update.",
      userFacingDescription: "Draft weekly updates.",
      instructions: "Summarize the week and list blockers.",
      mcpServerViews: [],
      attachedKnowledge: [],
      source: "agent",
      sourceMetadata: null,
    });

    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }

    expect(result.value.name).toBe("Write Weekly Digest");
    expect(result.value.icon).toBe("ActionBrainIcon");
    expect(result.value.source).toBe("agent");
    expect(result.value.sourceMetadata).toBeNull();
    expect(mockGetSkillIconSuggestion).toHaveBeenCalledOnce();
  });

  it("rejects duplicate active skill names", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    await SkillFactory.create(authenticator, { name: "Duplicate Skill" });

    const result = await createSkill(authenticator, {
      name: "Duplicate Skill",
      agentFacingDescription: "Use when duplicating.",
      userFacingDescription: "Duplicate.",
      instructions: "Do the duplicate thing.",
      icon: "ActionListIcon",
      mcpServerViews: [],
      attachedKnowledge: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected duplicate name to fail.");
    }
    expect(result.error.api_error.message).toBe(
      'A skill with the name "Duplicate Skill" already exists.'
    );
  });

  it("rejects creation for non-builders", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    const result = await createSkill(authenticator, {
      name: "User Skill",
      agentFacingDescription: "Use when a user asks.",
      userFacingDescription: "User skill.",
      instructions: "Do the thing.",
      icon: "ActionListIcon",
      mcpServerViews: [],
      attachedKnowledge: [],
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected non-builder creation to fail.");
    }
    expect(result.error.api_error.type).toBe("app_auth_error");
  });

  it("updates a skill and snapshots the previous version", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const skill = await SkillFactory.create(authenticator, {
      name: "Mutable Skill",
      instructions: "Original instructions.",
    });
    await authenticator.refresh();
    const versionWhere: WhereOptions<SkillVersionModel> = {
      skillConfigurationId: skill.id,
    };

    const versionCountBefore = await SkillVersionModel.count({
      where: versionWhere,
    });

    const result = await updateSkill(authenticator, skill, {
      instructions: "Updated instructions.",
    });

    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }
    const versionCountAfter = await SkillVersionModel.count({
      where: versionWhere,
    });
    expect(versionCountAfter).toBe(versionCountBefore + 1);

    const updatedSkill = await SkillResource.fetchById(
      authenticator,
      skill.sId
    );
    expect(updatedSkill?.instructions).toBe("Updated instructions.");
  });

  it("falls back to ActionListIcon when icon suggestion fails", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    mockGetSkillIconSuggestion.mockResolvedValue(
      new Err(new Error("no model"))
    );

    const result = await createSkill(authenticator, {
      name: "Fallback Icon Skill",
      agentFacingDescription: "Use when testing fallback icons.",
      userFacingDescription: "Fallback icon.",
      instructions: "Do the thing.",
      mcpServerViews: [],
      attachedKnowledge: [],
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }
    expect(result.value.icon).toBe("ActionListIcon");
  });
});
