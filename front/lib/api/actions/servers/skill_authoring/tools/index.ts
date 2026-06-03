import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CREATE_SKILL_TOOL_NAME,
  GET_SKILL_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  SKILL_AUTHORING_TOOLS_METADATA,
  UPDATE_SKILL_TOOL_NAME,
} from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { makeSkillAuthoringResultOutput } from "@app/lib/api/actions/servers/skill_authoring/rendering";
import { createSkill, updateSkill } from "@app/lib/api/skills/mutations";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function requireInteractiveBuilder(
  auth: Authenticator
): Result<UserResource, MCPError> {
  const user = auth.user();
  if (!user) {
    return new Err(
      new MCPError(
        "Skill authoring requires an interactive builder user context."
      )
    );
  }

  if (!auth.isBuilder()) {
    return new Err(new MCPError("Skill authoring requires a builder user."));
  }

  return new Ok(user);
}

function requireCustomSkillId(sId: string): Result<string, MCPError> {
  if (!isResourceSId("skill", sId)) {
    return new Err(
      new MCPError("Only custom workspace skills can be inspected or updated.")
    );
  }

  return new Ok(sId);
}

function makeJsonText(value: unknown) {
  return {
    type: "text" as const,
    text: JSON.stringify(value, null, 2),
  };
}

const handlers: ToolHandlers<typeof SKILL_AUTHORING_TOOLS_METADATA> = {
  [LIST_SKILLS_TOOL_NAME]: async (_params, { auth }) => {
    const skills = await SkillResource.listByWorkspace(auth, {
      status: "active",
      onlyCustom: true,
      withInstructions: false,
      withTools: false,
    });

    const summaries = skills.map((skill) => ({
      sId: skill.sId,
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      icon: skill.icon,
    }));

    return new Ok([
      {
        type: "text" as const,
        text: `Found ${summaries.length} active custom skill${summaries.length === 1 ? "" : "s"}.`,
      },
      makeJsonText({ skills: summaries }),
    ]);
  },

  [GET_SKILL_TOOL_NAME]: async ({ sId }, { auth }) => {
    const customSkillId = requireCustomSkillId(sId);
    if (customSkillId.isErr()) {
      return new Err(customSkillId.error);
    }

    const skill = await SkillResource.fetchById(auth, customSkillId.value);
    if (!skill) {
      return new Err(new MCPError("Skill not found."));
    }

    const {
      agentFacingDescription,
      icon,
      instructions,
      name,
      userFacingDescription,
    } = skill;

    return new Ok([
      makeJsonText({
        skill: {
          sId: skill.sId,
          name,
          agentFacingDescription,
          userFacingDescription,
          instructions,
          icon,
        },
      }),
    ]);
  },

  [CREATE_SKILL_TOOL_NAME]: async (
    { agentFacingDescription, icon, instructions, name, userFacingDescription },
    { auth }
  ) => {
    const user = requireInteractiveBuilder(auth);
    if (user.isErr()) {
      return new Err(user.error);
    }

    const skillResult = await createSkill(auth, {
      name,
      agentFacingDescription,
      userFacingDescription,
      instructions,
      instructionsHtml: null,
      icon,
      mcpServerViews: [],
      attachedKnowledge: [],
      source: "agent",
      sourceMetadata: null,
    });

    if (skillResult.isErr()) {
      return new Err(new MCPError(skillResult.error.api_error.message));
    }

    const owner = auth.getNonNullableWorkspace();
    const skill = skillResult.value;
    const text = `Created skill "${skill.name}".`;

    return new Ok([
      makeSkillAuthoringResultOutput({
        operation: "create",
        skillId: skill.sId,
        skillName: skill.name,
        text,
        workspaceId: owner.sId,
      }),
    ]);
  },

  [UPDATE_SKILL_TOOL_NAME]: async (
    {
      agentFacingDescription,
      icon,
      instructions,
      name,
      sId,
      userFacingDescription,
    },
    { auth }
  ) => {
    const user = requireInteractiveBuilder(auth);
    if (user.isErr()) {
      return new Err(user.error);
    }

    const customSkillId = requireCustomSkillId(sId);
    if (customSkillId.isErr()) {
      return new Err(customSkillId.error);
    }

    if (
      agentFacingDescription === undefined &&
      icon === undefined &&
      instructions === undefined &&
      name === undefined &&
      userFacingDescription === undefined
    ) {
      return new Err(new MCPError("No skill updates were provided."));
    }

    const skill = await SkillResource.fetchById(auth, customSkillId.value);
    if (!skill) {
      return new Err(new MCPError("Skill not found."));
    }

    const skillResult = await updateSkill(auth, skill, {
      agentFacingDescription,
      icon,
      instructions,
      name,
      userFacingDescription,
    });

    if (skillResult.isErr()) {
      return new Err(new MCPError(skillResult.error.api_error.message));
    }

    const owner = auth.getNonNullableWorkspace();
    const updatedSkill = skillResult.value;
    const text = `Updated skill "${updatedSkill.name}".`;

    return new Ok([
      makeSkillAuthoringResultOutput({
        operation: "update",
        skillId: updatedSkill.sId,
        skillName: updatedSkill.name,
        text,
        workspaceId: owner.sId,
      }),
    ]);
  },
};

export const TOOLS = buildTools(SKILL_AUTHORING_TOOLS_METADATA, handlers);
