import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { CreateSkillArgs } from "@app/lib/api/actions/servers/skill_authoring/metadata";
import {
  CREATE_SKILL_TOOL_NAME,
  GET_SKILL_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  SKILL_AUTHORING_TOOLS_METADATA,
  UPDATE_SKILL_TOOL_NAME,
} from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { makeSkillAuthoringResultOutput } from "@app/lib/api/actions/servers/skill_authoring/rendering";
import { getUpdatedContentAndOccurrences } from "@app/lib/api/files/utils";
import { findDisallowedSpecialTagChanges } from "@app/lib/api/skills/instructions_special_tags";
import {
  suggestSkillIconOrDefault,
  validateSkillCreation,
} from "@app/lib/api/skills/skill_creation";
import type { Authenticator } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import { pruneOutdatedSkillEditSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { DEFAULT_SKILL_AVAILABILITY } from "@app/types/assistant/skill_configuration";
import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/types/resources_icon_names";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function requireInteractiveUser(
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

export async function createSkill(
  auth: Authenticator,
  {
    agentFacingDescription,
    bypassSimilarSkillCheck,
    icon,
    instructions,
    name,
    userFacingDescription,
  }: CreateSkillArgs
): Promise<Result<SkillResource, MCPError>> {
  const validation = await validateSkillCreation(auth, {
    name,
    userFacingDescription,
    agentFacingDescription,
    instructions,
    bypassSimilarSkillCheck,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }
  const { user, name: trimmedName } = validation.value;

  // Ignore an invalid agent-supplied icon and fall back to a suggestion
  // rather than persisting a name that renders as a broken glyph.
  const resolvedIcon =
    icon && isValidSkillIcon(icon)
      ? icon
      : await suggestSkillIconOrDefault(auth, {
          name: trimmedName,
          instructions,
          agentFacingDescription,
        });

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const skill = await SkillResource.makeNew(
    auth,
    {
      status: "active",
      name: trimmedName,
      agentFacingDescription,
      userFacingDescription,
      instructions,
      instructionsHtml: convertMarkdownToBlockHtml(instructions),
      editedBy: user.id,
      requestedSpaceIds: [globalSpace.id],
      icon: resolvedIcon,
      source: "agent",
      sourceMetadata: null,
      availability: DEFAULT_SKILL_AVAILABILITY,
      reinforcement: "on",
    },
    {
      mcpServerViews: [],
      attachedKnowledge: [],
    }
  );

  await auth.refresh();

  return new Ok(skill);
}

const handlers: ToolHandlers<typeof SKILL_AUTHORING_TOOLS_METADATA> = {
  [LIST_SKILLS_TOOL_NAME]: async ({ filter, cursor, limit }, { auth }) => {
    const user = requireInteractiveUser(auth);
    if (user.isErr()) {
      return new Err(user.error);
    }

    const resolvedFilter = filter ?? "writable";

    let skills;
    if (resolvedFilter === "agent_discoverable") {
      skills = await SkillResource.listDiscoverable(auth);
    } else {
      const allSkills = await SkillResource.listByWorkspace(auth, {
        status: "active",
        onlyCustom: false,
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      });
      skills =
        resolvedFilter === "writable"
          ? allSkills.filter((skill) => skill.canWrite(auth))
          : allSkills;
    }

    skills = [...skills].sort((a, b) => a.sId.localeCompare(b.sId));

    const pageSize = Math.min(limit ?? 20, 50);
    const offset = cursor ?? 0;

    if (offset >= skills.length && offset > 0) {
      return new Err(
        new MCPError(
          `cursor ${offset} is out of range (total: ${skills.length})`,
          { tracked: false }
        )
      );
    }

    const page = skills.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const nextCursor = nextOffset < skills.length ? nextOffset : null;

    const summaries = page.map((skill) => ({
      sId: skill.sId,
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      canWrite: skill.canWrite(auth),
    }));

    return new Ok([
      makeJsonText({
        total: skills.length,
        skills: summaries,
        nextCursor,
      }),
    ]);
  },

  [GET_SKILL_TOOL_NAME]: async ({ sId }, { auth }) => {
    const user = requireInteractiveUser(auth);
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

  [CREATE_SKILL_TOOL_NAME]: async (args, { auth }) => {
    const result = await createSkill(auth, args);
    if (result.isErr()) {
      return new Err(result.error);
    }

    const owner = auth.getNonNullableWorkspace();
    const skill = result.value;
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
    const user = requireInteractiveUser(auth);
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
      return new Err(
        new MCPError(
          "You need to be added as an editor of this skill before you can make changes."
        )
      );
    }

    // An archived skill is frozen: restoring it is the only change it accepts.
    if (skill.status === "archived") {
      return new Err(
        new MCPError("This skill is archived and cannot be updated.")
      );
    }

    // Resolve the new instructions: undefined keeps the existing ones, a full
    // string replaces them, and a targeted edit applies a str-replace on the
    // current instructions (mirroring the Files MCP edit pattern).
    let resolvedInstructions: string | undefined = instructions;
    // The `old_string !== undefined` check only narrows the type; both halves
    // are already guaranteed non-undefined by the validation above.
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

    // Guard builder-managed special tags. Nested skill references re-derive from
    // the instructions, so the agent may add them but not drop them; knowledge and
    // tool tags cannot be wired from text, so they must stay exactly as they were.
    if (
      resolvedInstructions !== undefined &&
      resolvedInstructions !== skill.instructions
    ) {
      const disallowed = findDisallowedSpecialTagChanges(
        skill.instructions,
        resolvedInstructions
      );
      if (disallowed.length > 0) {
        return new Err(
          new MCPError(
            `The edit changes special tags the skill depends on ` +
              `(${disallowed.join(", ")}). These tags are managed in the builder: ` +
              "keep existing knowledge and tool tags verbatim, do not add new ones, " +
              "and do not remove nested skill references."
          )
        );
      }
    }

    const trimmedName = name !== undefined ? name.trim() : skill.name;
    if (!trimmedName) {
      return new Err(new MCPError("Skill name cannot be empty."));
    }

    const existingSkill = await SkillResource.fetchByName(auth, trimmedName);
    if (existingSkill && existingSkill.id !== skill.id) {
      return new Err(
        new MCPError(`A skill with the name "${trimmedName}" already exists.`)
      );
    }

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
      manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
      requestedSpaceIds: skill.requestedSpaceIds,
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
