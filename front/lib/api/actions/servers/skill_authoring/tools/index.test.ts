import { MCPError } from "@app/lib/actions/mcp_errors";
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
import { describe, expect, it } from "vitest";

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
    signal: new AbortController().signal,
  } as never;
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
});
