import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icon_names";
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
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
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

// The agent supplies icon names as free text (unlike the builder UI's picker),
// so guard against hallucinated names that would render as a broken glyph.
function isValidSkillIcon(icon: string): boolean {
  return isInternalAllowedIcon(icon) || isCustomResourceIconType(icon);
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

    // Ignore an invalid agent-supplied icon and fall back to a suggestion
    // rather than persisting a name that renders as a broken glyph.
    let resolvedIcon = icon && isValidSkillIcon(icon) ? icon : null;
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
      old_string,
      new_string,
      expected_replacements,
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

    const isTargetedInstructionsEdit =
      old_string !== undefined || new_string !== undefined;

    if (
      agentFacingDescription === undefined &&
      icon === undefined &&
      instructions === undefined &&
      !isTargetedInstructionsEdit &&
      name === undefined &&
      userFacingDescription === undefined
    ) {
      return new Err(new MCPError("No skill updates were provided."));
    }

    if (isTargetedInstructionsEdit && instructions !== undefined) {
      return new Err(
        new MCPError(
          "Provide either `instructions` (full replace) or `old_string`/" +
            "`new_string` (targeted edit), not both."
        )
      );
    }

    if (
      isTargetedInstructionsEdit &&
      (old_string === undefined || new_string === undefined)
    ) {
      return new Err(
        new MCPError(
          "A targeted instructions edit requires both `old_string` and " +
            "`new_string`."
        )
      );
    }

    if (icon !== undefined && !isValidSkillIcon(icon)) {
      return new Err(
        new MCPError(
          `"${icon}" is not a valid skill icon. Omit the icon or use a valid icon name.`
        )
      );
    }

    const skill = await SkillResource.fetchById(auth, customSkillId.value);
    if (!skill) {
      return new Err(new MCPError("Skill not found."));
    }

    if (!skill.canWrite(auth)) {
      return new Err(new MCPError("Skill not found."));
    }

    // Resolve the new instructions: undefined keeps the existing ones, a full
    // string replaces them, and a targeted edit applies a str-replace on the
    // current instructions (mirroring the Files MCP edit pattern).
    let resolvedInstructions: string | undefined = instructions;
    if (isTargetedInstructionsEdit && old_string !== undefined) {
      const { updatedContent, occurrences } = getUpdatedContentAndOccurrences({
        oldString: old_string,
        newString: new_string ?? "",
        currentContent: skill.instructions,
      });

      if (occurrences === 0) {
        return new Err(
          new MCPError(
            `\`old_string\` was not found in the skill instructions: "${old_string}".`
          )
        );
      }

      const expected = expected_replacements ?? 1;
      if (occurrences !== expected) {
        return new Err(
          new MCPError(
            `Expected ${expected} replacement${expected === 1 ? "" : "s"}, but ` +
              `\`old_string\` matched ${occurrences} time${occurrences === 1 ? "" : "s"}. ` +
              "Add more surrounding context to target a single occurrence, or set " +
              "`expected_replacements`."
          )
        );
      }

      resolvedInstructions = updatedContent;
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
      instructions: resolvedInstructions ?? skill.instructions,
      instructionsHtml:
        resolvedInstructions !== undefined
          ? convertMarkdownToBlockHtml(resolvedInstructions)
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
