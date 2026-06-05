import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CREATE_SKILL_TOOL_NAME,
  GET_SKILL_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  UPDATE_SKILL_TOOL_NAME,
} from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { isSkillAuthoringResultOutput } from "@app/lib/api/actions/servers/skill_authoring/rendering";
import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it, vi } from "vitest";

// Force a deterministic icon suggestion so the invalid-icon fallback does not
// depend on a live LLM call.
vi.mock("@app/lib/api/skills/icon_suggestion", async () => {
  const { Ok } = await import("@app/types/shared/result");
  return {
    getSkillIconSuggestion: async () => new Ok("ActionBrainIcon"),
  };
});

import { TOOLS } from "./index";

function getTool(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool;
}

function makeExtra(auth: Authenticator) {
  return {
    auth,
    requestId: "test-request",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request in skill_authoring test.");
    },
    signal: new AbortController().signal,
  } satisfies ToolHandlerExtra;
}

// Seed a skill directly and refresh the authenticator so it picks up the editor
// group membership created during makeNew (create_skill does the same refresh).
async function seedSkill(
  auth: Authenticator,
  overrides: Parameters<typeof SkillFactory.create>[1]
) {
  const skill = await SkillFactory.create(auth, overrides);
  await auth.refresh();
  return skill;
}

describe("skill_authoring tools", () => {
  it("creates, lists, reads, and updates a skill", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "builder",
    });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Incident Summary",
        userFacingDescription: "Summarize incidents.",
        agentFacingDescription: "Use when writing incident summaries.",
        instructions: "Collect impact, timeline, root cause, and follow-ups.",
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );

    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const output = createResult.value[0];
    expect(isSkillAuthoringResultOutput(output)).toBe(true);
    if (!isSkillAuthoringResultOutput(output)) {
      throw new Error("Expected structured skill authoring output.");
    }
    expect(output.resource.url).toBe(
      `/w/${workspace.sId}/builder/skills/${output.resource.skillId}`
    );

    const createdSkill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    expect(createdSkill?.source).toBe("agent");
    expect(createdSkill?.instructionsHtml).toContain(
      "Collect impact, timeline, root cause, and follow-ups."
    );

    const listResult = await getTool(LIST_SKILLS_TOOL_NAME).handler(
      {},
      makeExtra(authenticator)
    );
    expect(listResult.isOk()).toBe(true);
    if (listResult.isErr()) {
      throw listResult.error;
    }
    expect(listResult.value[1]?.type).toBe("text");
    if (listResult.value[1]?.type !== "text") {
      throw new Error("Expected JSON text output.");
    }
    expect(JSON.parse(listResult.value[1].text)).toMatchObject({
      skills: [
        expect.objectContaining({
          sId: output.resource.skillId,
          name: "Incident Summary",
        }),
      ],
    });

    const getResult = await getTool(GET_SKILL_TOOL_NAME).handler(
      { sId: output.resource.skillId },
      makeExtra(authenticator)
    );
    expect(getResult.isOk()).toBe(true);
    if (getResult.isErr()) {
      throw getResult.error;
    }
    expect(getResult.value[0]?.type).toBe("text");
    if (getResult.value[0]?.type !== "text") {
      throw new Error("Expected JSON text output.");
    }
    expect(JSON.parse(getResult.value[0].text)).toMatchObject({
      skill: {
        sId: output.resource.skillId,
        instructions: "Collect impact, timeline, root cause, and follow-ups.",
      },
    });

    const otherUser = await UserFactory.basic();
    const owner = authenticator.getNonNullableWorkspace();
    await MembershipFactory.associate(owner, otherUser, { role: "builder" });
    const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const otherListResult = await getTool(LIST_SKILLS_TOOL_NAME).handler(
      {},
      makeExtra(otherAuthenticator)
    );
    expect(otherListResult.isOk()).toBe(true);
    if (otherListResult.isErr()) {
      throw otherListResult.error;
    }
    expect(otherListResult.value[1]?.type).toBe("text");
    if (otherListResult.value[1]?.type !== "text") {
      throw new Error("Expected JSON text output.");
    }
    expect(JSON.parse(otherListResult.value[1].text)).toMatchObject({
      skills: [],
    });

    const otherGetResult = await getTool(GET_SKILL_TOOL_NAME).handler(
      { sId: output.resource.skillId },
      makeExtra(otherAuthenticator)
    );
    expect(otherGetResult.isErr()).toBe(true);
    if (otherGetResult.isOk()) {
      throw new Error("Expected another builder not to read the skill.");
    }
    expect(otherGetResult.error.message).toBe("Skill not found.");

    const otherUpdateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        instructions: "Unauthorized update.",
      },
      makeExtra(otherAuthenticator)
    );
    expect(otherUpdateResult.isErr()).toBe(true);
    if (otherUpdateResult.isOk()) {
      throw new Error("Expected another builder not to update the skill.");
    }
    expect(otherUpdateResult.error.message).toBe("Skill not found.");

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        instructions: "Collect impact, timeline, root cause, and owners.",
      },
      makeExtra(authenticator)
    );
    expect(updateResult.isOk()).toBe(true);

    const updatedSkill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    expect(updatedSkill?.instructions).toBe(
      "Collect impact, timeline, root cause, and owners."
    );
    expect(updatedSkill?.instructionsHtml).toContain(
      "Collect impact, timeline, root cause, and owners."
    );
  });

  it("returns an MCPError without an interactive user", async () => {
    const { workspace } = await createResourceTest({ role: "builder" });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "No User Skill",
        userFacingDescription: "No user.",
        agentFacingDescription: "Use when no user exists.",
        instructions: "Do not create this.",
        icon: "ActionListIcon",
      },
      makeExtra(auth)
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected missing user to fail.");
    }
    expect(result.error).toBeInstanceOf(MCPError);
    expect(result.error.message).toContain("interactive builder user context");
  });

  it("returns an MCPError for non-builders", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    const result = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "User Skill",
        userFacingDescription: "User.",
        agentFacingDescription: "Use for user role.",
        instructions: "Do not create this.",
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected non-builder to fail.");
    }
    expect(result.error.message).toContain("builder");
  });

  it("ignores an invalid icon on create and falls back to a valid one", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Bad Icon Skill",
        userFacingDescription: "Skill with a hallucinated icon name.",
        agentFacingDescription: "Use to verify icon validation.",
        instructions: "Do the thing.",
        icon: "TotallyNotARealIcon",
      },
      makeExtra(authenticator)
    );

    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const output = createResult.value[0];
    if (!isSkillAuthoringResultOutput(output)) {
      throw new Error("Expected structured skill authoring output.");
    }

    const createdSkill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    // The hallucinated name is dropped; the suggestion fallback is persisted.
    expect(createdSkill?.icon).toBe("ActionBrainIcon");
  });

  it("rejects an invalid icon on update", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Update Icon Skill",
        userFacingDescription: "Skill to update.",
        agentFacingDescription: "Use to verify update icon validation.",
        instructions: "Do the thing.",
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const output = createResult.value[0];
    if (!isSkillAuthoringResultOutput(output)) {
      throw new Error("Expected structured skill authoring output.");
    }

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        icon: "TotallyNotARealIcon",
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected invalid icon to be rejected.");
    }
    expect(updateResult.error).toBeInstanceOf(MCPError);
    expect(updateResult.error.message).toContain("not a valid skill icon");

    // The original icon is preserved.
    const skill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    expect(skill?.icon).toBe("ActionListIcon");
  });

  it("applies a targeted instructions edit with old_string/new_string", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Targeted Edit Skill",
        userFacingDescription: "Skill to edit.",
        agentFacingDescription: "Use to verify targeted edits.",
        instructions: "Collect impact, timeline, root cause, and follow-ups.",
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const output = createResult.value[0];
    if (!isSkillAuthoringResultOutput(output)) {
      throw new Error("Expected structured skill authoring output.");
    }

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        old_string: "follow-ups",
        new_string: "owners",
      },
      makeExtra(authenticator)
    );
    expect(updateResult.isOk()).toBe(true);

    const skill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    expect(skill?.instructions).toBe(
      "Collect impact, timeline, root cause, and owners."
    );
    expect(skill?.instructionsHtml).toContain("owners");
  });

  it("rejects an edit when old_string is not found", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Missing Match Skill",
        userFacingDescription: "Skill to edit.",
        agentFacingDescription: "Use to verify missing matches.",
        instructions: "Do the thing.",
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const output = createResult.value[0];
    if (!isSkillAuthoringResultOutput(output)) {
      throw new Error("Expected structured skill authoring output.");
    }

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        old_string: "not in the instructions",
        new_string: "whatever",
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected a missing old_string to be rejected.");
    }
    expect(updateResult.error.message).toContain("was not found");

    // The instructions are left untouched.
    const skill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    expect(skill?.instructions).toBe("Do the thing.");
  });

  it("rejects an edit when the replacement count does not match", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Multiple Match Skill",
        userFacingDescription: "Skill to edit.",
        agentFacingDescription: "Use to verify count mismatches.",
        instructions: "step. step. step.",
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const output = createResult.value[0];
    if (!isSkillAuthoringResultOutput(output)) {
      throw new Error("Expected structured skill authoring output.");
    }

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        old_string: "step",
        new_string: "phase",
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected a count mismatch to be rejected.");
    }
    expect(updateResult.error.message).toContain("matched 3 times");

    // Passing the right expected_replacements lets the edit through.
    const retryResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        old_string: "step",
        new_string: "phase",
        expected_replacements: 3,
      },
      makeExtra(authenticator)
    );
    expect(retryResult.isOk()).toBe(true);

    const skill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    expect(skill?.instructions).toBe("phase. phase. phase.");
  });

  it("rejects a full replace that drops a knowledge tag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const originalInstructions =
      'Summarize the runbook. <knowledge id="data_xyz" title="Runbook" />';
    const skill = await seedSkill(authenticator, {
      name: "Tagged Skill",
      instructions: originalInstructions,
    });

    // A full replace that omits the knowledge tag is rejected.
    const droppingResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        instructions: "Summarize the runbook in three bullet points.",
      },
      makeExtra(authenticator)
    );
    expect(droppingResult.isErr()).toBe(true);
    if (droppingResult.isOk()) {
      throw new Error("Expected a tag-dropping replace to be rejected.");
    }
    expect(droppingResult.error.message).toContain("special tags");
    expect(droppingResult.error.message).toContain("knowledge");

    // The instructions are left untouched.
    const untouched = await SkillResource.fetchById(authenticator, skill.sId);
    expect(untouched?.instructions).toBe(originalInstructions);

    // A full replace that keeps the tag is allowed.
    const keepingResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        instructions:
          'Summarize the runbook briefly. <knowledge id="data_xyz" title="Runbook" />',
      },
      makeExtra(authenticator)
    );
    expect(keepingResult.isOk()).toBe(true);
  });

  it("rejects a targeted edit that drops a knowledge tag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const originalInstructions =
      'Summarize the runbook. <knowledge id="data_xyz" title="Runbook" />';
    const skill = await seedSkill(authenticator, {
      name: "Targeted Knowledge Skill",
      instructions: originalInstructions,
    });

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        old_string: '<knowledge id="data_xyz" title="Runbook" />',
        new_string: "the runbook",
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected a tag-dropping targeted edit to be rejected.");
    }
    expect(updateResult.error.message).toContain("knowledge");

    const untouched = await SkillResource.fetchById(authenticator, skill.sId);
    expect(untouched?.instructions).toBe(originalInstructions);
  });

  it("rejects a targeted edit that drops a nested skill tag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    await FeatureFlagFactory.basic(authenticator, "nested_skills");

    const childSkill = await SkillFactory.create(authenticator, {
      name: "Child Skill",
    });
    const skillReferenceTag =
      SkillFactory.serializeSkillReferenceTag(childSkill);
    const originalInstructions = `Use ${skillReferenceTag} for details.`;
    const parentSkill = await seedSkill(authenticator, {
      name: "Parent Skill",
      instructions: originalInstructions,
      enableSkillReferences: true,
      referencedSkillIds: [childSkill.sId],
    });

    await expect(parentSkill.fetchChildSkills(authenticator)).resolves.toEqual([
      expect.objectContaining({ sId: childSkill.sId }),
    ]);

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: parentSkill.sId,
        old_string: skillReferenceTag,
        new_string: "Child Skill",
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected a nested-skill tag drop to be rejected.");
    }
    expect(updateResult.error.message).toContain("nested skills");

    const unchangedParent = await SkillResource.fetchById(
      authenticator,
      parentSkill.sId
    );
    if (!unchangedParent) {
      throw new Error("Expected parent skill to exist.");
    }
    expect(unchangedParent.instructions).toBe(originalInstructions);
    await expect(
      unchangedParent.fetchChildSkills(authenticator)
    ).resolves.toEqual([expect.objectContaining({ sId: childSkill.sId })]);
  });

  it("rejects a full replace that strips knowledge tag attributes", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const originalInstructions =
      'Use <knowledge id="n1" title="Runbook" space="sp1" dsv="dsv1" hasChildren="true" /> for context.';
    const skill = await seedSkill(authenticator, {
      name: "Knowledge Attributes Skill",
      instructions: originalInstructions,
    });

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        instructions: 'Use <knowledge id="n1" title="Runbook" /> for context.',
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected stripped knowledge attributes to be rejected.");
    }
    expect(updateResult.error.message).toContain("knowledge");

    const untouched = await SkillResource.fetchById(authenticator, skill.sId);
    expect(untouched?.instructions).toBe(originalInstructions);
  });

  it("allows a full replace that reorders knowledge tag attributes", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const originalInstructions =
      'Use <knowledge id="n1" title="Runbook" space="sp1" dsv="dsv1" hasChildren="true" /> for context.';
    const reorderedInstructions =
      'Use <knowledge hasChildren="true" dsv="dsv1" title="Runbook" id="n1" space="sp1" /> for context.';
    const skill = await seedSkill(authenticator, {
      name: "Reordered Knowledge Skill",
      instructions: originalInstructions,
    });

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        instructions: reorderedInstructions,
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isOk()).toBe(true);
    const updated = await SkillResource.fetchById(authenticator, skill.sId);
    expect(updated?.instructions).toBe(reorderedInstructions);
  });

  it("rejects a full replace that strips tool tag attributes", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const originalInstructions =
      'Use <tool id="tool_1" name="Search" icon="ActionListIcon" /> for research.';
    const skill = await seedSkill(authenticator, {
      name: "Tool Attributes Skill",
      instructions: originalInstructions,
    });

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        instructions: 'Use <tool id="tool_1" name="Search" /> for research.',
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected stripped tool attributes to be rejected.");
    }
    expect(updateResult.error.message).toContain("tools");

    const untouched = await SkillResource.fetchById(authenticator, skill.sId);
    expect(untouched?.instructions).toBe(originalInstructions);
  });

  it("keeps nested skill references in sync when editing instructions", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    await FeatureFlagFactory.basic(authenticator, "nested_skills");

    const childSkill = await SkillFactory.create(authenticator, {
      name: "Child Skill",
    });
    const skillReferenceTag =
      SkillFactory.serializeSkillReferenceTag(childSkill);
    // Seed a parent whose instructions mention the reference but whose links are
    // not wired yet, mirroring a skill whose references are out of sync.
    const parentSkill = await seedSkill(authenticator, {
      name: "Parent Skill",
      instructions: `Use ${skillReferenceTag} when needed.`,
      enableSkillReferences: false,
      referencedSkillIds: [],
    });

    await expect(parentSkill.fetchChildSkills(authenticator)).resolves.toEqual(
      []
    );

    // A targeted edit that keeps the reference tag re-derives the references.
    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: parentSkill.sId,
        old_string: "when needed",
        new_string: "for details",
      },
      makeExtra(authenticator)
    );
    expect(updateResult.isOk()).toBe(true);

    const parentAfter = await SkillResource.fetchById(
      authenticator,
      parentSkill.sId
    );
    await expect(parentAfter?.fetchChildSkills(authenticator)).resolves.toEqual(
      [expect.objectContaining({ sId: childSkill.sId })]
    );
  });

  it("rejects creating a skill that embeds a knowledge tag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Phantom Knowledge Skill",
        userFacingDescription: "Skill that should not embed a knowledge tag.",
        agentFacingDescription: "Use to verify create rejects special tags.",
        instructions:
          'Summarize the runbook. <knowledge id="data_xyz" title="Runbook" />',
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );

    expect(createResult.isErr()).toBe(true);
    if (createResult.isOk()) {
      throw new Error("Expected a knowledge tag on create to be rejected.");
    }
    expect(createResult.error.message).toContain("special tags");
    expect(createResult.error.message).toContain("knowledge");
  });

  it("rejects creating a skill that embeds a tool tag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Phantom Tool Skill",
        userFacingDescription: "Skill that should not embed a tool tag.",
        agentFacingDescription: "Use to verify create rejects special tags.",
        instructions:
          'Use <tool id="tool_1" name="Search" icon="ActionListIcon" /> for research.',
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );

    expect(createResult.isErr()).toBe(true);
    if (createResult.isOk()) {
      throw new Error("Expected a tool tag on create to be rejected.");
    }
    expect(createResult.error.message).toContain("special tags");
    expect(createResult.error.message).toContain("tools");
  });

  it("rejects creating a skill that embeds a nested skill reference", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    await FeatureFlagFactory.basic(authenticator, "nested_skills");

    const childSkill = await SkillFactory.create(authenticator, {
      name: "Child Skill",
    });
    const skillReferenceTag =
      SkillFactory.serializeSkillReferenceTag(childSkill);

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Phantom Reference Skill",
        userFacingDescription: "Skill that should not embed a reference.",
        agentFacingDescription: "Use to verify create rejects special tags.",
        instructions: `Use ${skillReferenceTag} when needed.`,
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );

    expect(createResult.isErr()).toBe(true);
    if (createResult.isOk()) {
      throw new Error("Expected a nested skill tag on create to be rejected.");
    }
    expect(createResult.error.message).toContain("special tags");
    expect(createResult.error.message).toContain("nested skills");
  });

  it("rejects a full replace that adds a knowledge tag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const originalInstructions =
      "Summarize the runbook in three bullet points.";
    const skill = await seedSkill(authenticator, {
      name: "Plain Knowledge Skill",
      instructions: originalInstructions,
    });

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        instructions:
          'Summarize the runbook. <knowledge id="data_xyz" title="Runbook" />',
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected an added knowledge tag to be rejected.");
    }
    expect(updateResult.error.message).toContain("knowledge");

    const untouched = await SkillResource.fetchById(authenticator, skill.sId);
    expect(untouched?.instructions).toBe(originalInstructions);
  });

  it("rejects a targeted edit that adds a tool tag", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });
    const originalInstructions = "Use the search step for research.";
    const skill = await seedSkill(authenticator, {
      name: "Plain Tool Skill",
      instructions: originalInstructions,
    });

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: skill.sId,
        old_string: "the search step",
        new_string: '<tool id="tool_1" name="Search" icon="ActionListIcon" />',
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected an added tool tag to be rejected.");
    }
    expect(updateResult.error.message).toContain("tools");

    const untouched = await SkillResource.fetchById(authenticator, skill.sId);
    expect(untouched?.instructions).toBe(originalInstructions);
  });

  it("rejects combining a full instructions replace with a targeted edit", async () => {
    const { authenticator } = await createResourceTest({ role: "builder" });

    const createResult = await getTool(CREATE_SKILL_TOOL_NAME).handler(
      {
        name: "Conflicting Modes Skill",
        userFacingDescription: "Skill to edit.",
        agentFacingDescription: "Use to verify mutually exclusive modes.",
        instructions: "Original instructions.",
        icon: "ActionListIcon",
      },
      makeExtra(authenticator)
    );
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }
    const output = createResult.value[0];
    if (!isSkillAuthoringResultOutput(output)) {
      throw new Error("Expected structured skill authoring output.");
    }

    const updateResult = await getTool(UPDATE_SKILL_TOOL_NAME).handler(
      {
        sId: output.resource.skillId,
        instructions: "Brand new instructions.",
        old_string: "Original",
        new_string: "Updated",
      },
      makeExtra(authenticator)
    );

    expect(updateResult.isErr()).toBe(true);
    if (updateResult.isOk()) {
      throw new Error("Expected conflicting modes to be rejected.");
    }
    expect(updateResult.error.message).toContain("not both");

    // Nothing changed.
    const skill = await SkillResource.fetchById(
      authenticator,
      output.resource.skillId
    );
    expect(skill?.instructions).toBe("Original instructions.");
  });
});
