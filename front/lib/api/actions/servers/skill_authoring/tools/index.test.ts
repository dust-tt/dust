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
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
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
});
