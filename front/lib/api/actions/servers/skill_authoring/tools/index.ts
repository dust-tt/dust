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
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { pruneOutdatedSkillEditSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
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
    const user = requireInteractiveBuilder(auth);
    if (user.isErr()) {
      return new Err(user.error);
    }

    const skills = await SkillResource.listByWorkspace(auth, {
      status: "active",
      onlyCustom: true,
      withInstructions: false,
      withTools: false,
    });

    const summaries = skills
      .filter((skill) => skill.canWrite(auth))
      .map((skill) => ({
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
    const user = requireInteractiveBuilder(auth);
    if (user.isErr()) {
      return new Err(user.error);
    }

    const customSkillId = requireCustomSkillId(sId);
    if (customSkillId.isErr()) {
      return new Err(customSkillId.error);
    }

    const skill = await SkillResource.fetchById(auth, customSkillId.value);
    if (!skill) {
      return new Err(new MCPError("Skill not found."));
    }
    if (!skill.canWrite(auth)) {
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

    const trimmedName = name.trim();
    if (!trimmedName) {
      return new Err(new MCPError("Skill name cannot be empty."));
    }

    const existingSkill = await SkillResource.fetchActiveByName(
      auth,
      trimmedName
    );
    if (existingSkill) {
      return new Err(
        new MCPError(`A skill with the name "${trimmedName}" already exists.`)
      );
    }

    let resolvedIcon = icon ?? null;
    if (!resolvedIcon) {
      const iconResult = await getSkillIconSuggestion(auth, {
        name: trimmedName,
        instructions,
        agentFacingDescription,
      });

      if (iconResult.isOk()) {
        resolvedIcon = iconResult.value;
      } else {
        logger.warn(
          { err: iconResult.error },
          "Failed to generate icon suggestion for skill"
        );
        resolvedIcon = "ActionListIcon";
      }
    }

    const skill = await SkillResource.makeNew(
      auth,
      {
        status: "active",
        name: trimmedName,
        agentFacingDescription,
        userFacingDescription,
        instructions,
        instructionsHtml: convertMarkdownToBlockHtml(instructions),
        editedBy: user.value.id,
        requestedSpaceIds: [],
        extendedSkillId: null,
        icon: resolvedIcon,
        source: "agent",
        sourceMetadata: null,
        isDefault: false,
        reinforcement: "on",
      },
      {
        mcpServerViews: [],
        attachedKnowledge: [],
        enableSkillReferences: false,
        referencedSkillIds: [],
      }
    );

    await auth.refresh();

    const owner = auth.getNonNullableWorkspace();
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
      userFacingDescription,
      name,
      sId,
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

    if (!skill.canWrite(auth)) {
      return new Err(new MCPError("Skill not found."));
    }

    const trimmedName = name !== undefined ? name.trim() : skill.name;
    if (!trimmedName) {
      return new Err(new MCPError("Skill name cannot be empty."));
    }

    const existingSkill = await SkillResource.fetchActiveByName(
      auth,
      trimmedName
    );
    if (existingSkill && existingSkill.id !== skill.id) {
      return new Err(
        new MCPError(`A skill with the name "${trimmedName}" already exists.`)
      );
    }

    const enableSkillReferences = (await getFeatureFlags(auth)).includes(
      "nested_skills"
    );
    const attachedKnowledge = await skill.getAttachedKnowledge(auth);

    await skill.updateSkill(auth, {
      agentFacingDescription:
        agentFacingDescription ?? skill.agentFacingDescription,
      attachedKnowledge,
      icon: icon !== undefined ? icon : skill.icon,
      instructions: instructions ?? skill.instructions,
      instructionsHtml:
        instructions !== undefined
          ? convertMarkdownToBlockHtml(instructions)
          : skill.instructionsHtml,
      mcpServerViews: skill.mcpServerViews,
      name: trimmedName,
      requestedSpaceIds: skill.requestedSpaceIds,
      enableSkillReferences,
      userFacingDescription:
        userFacingDescription ?? skill.userFacingDescription,
    });

    await pruneOutdatedSkillEditSuggestions(auth, skill);

    const owner = auth.getNonNullableWorkspace();
    const text = `Updated skill "${skill.name}".`;

    return new Ok([
      makeSkillAuthoringResultOutput({
        operation: "update",
        skillId: skill.sId,
        skillName: skill.name,
        text,
        workspaceId: owner.sId,
      }),
    ]);
  },
};

export const TOOLS = buildTools(SKILL_AUTHORING_TOOLS_METADATA, handlers);
