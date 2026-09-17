import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { SuggestSkillUpdateArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import type { Authenticator } from "@app/lib/auth";
import {
  hasSuggestionSelfConflict,
  pruneConflictingSkillEditSuggestions,
} from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isEditSkillSuggestion } from "@app/types/suggestions/skill_suggestion";

/**
 * @cc [owner:fabiencelier,label:security] requires-skill-write
 * A suggestion MUST only be created for a custom skill the calling user can write; otherwise the
 * call fails with an `MCPError` and no row is created.
 */
export async function suggestSkillUpdate(
  auth: Authenticator,
  {
    skillId,
    instructionEdits,
    agentFacingDescriptionEdit,
    analysis,
    title,
  }: SuggestSkillUpdateArgs
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting skill updates requires an interactive user context."
      )
    );
  }

  if (!isResourceSId("skill", skillId)) {
    return new Err(
      new MCPError("Only custom workspace skills can receive suggestions.")
    );
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    return new Err(new MCPError("Skill not found."));
  }

  if (!skill.canWrite(auth)) {
    return new Err(
      new MCPError(
        "You need to be added as an editor of this skill before you can suggest changes."
      )
    );
  }

  const hasInstructionEdits = (instructionEdits?.length ?? 0) > 0;
  if (!hasInstructionEdits && agentFacingDescriptionEdit === undefined) {
    return new Err(
      new MCPError(
        "Provide at least one of `instructionEdits` or `agentFacingDescriptionEdit`."
      )
    );
  }

  if (skill.status === "archived") {
    return new Err(
      new MCPError("This skill is archived and cannot receive suggestions.")
    );
  }

  if (hasInstructionEdits && !skill.instructionsHtml) {
    return new Err(
      new MCPError(
        "This skill has no block-structured instructions, so `instructionEdits` cannot be " +
          "targeted. Suggest an `agentFacingDescriptionEdit` instead."
      )
    );
  }

  const suggestion = { instructionEdits, agentFacingDescriptionEdit };

  if (hasSuggestionSelfConflict(suggestion, skill.instructionsHtml)) {
    return new Err(
      new MCPError(
        "The suggested instruction edits overlap (a block and one of its descendants are " +
          "both targeted). Target each region of the instructions only once."
      )
    );
  }

  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    skill,
    {
      kind: "edit",
      suggestion,
      analysis: analysis ?? null,
      title: title ?? null,
      state: "pending",
      source: "conversational",
      sourceConversationIds: null,
    }
  );

  if (isEditSkillSuggestion(created)) {
    await pruneConflictingSkillEditSuggestions(auth, skill, created);
  }

  return new Ok(created);
}

export async function suggestSkillUpdateHandler(
  args: SuggestSkillUpdateArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestSkillUpdate(auth, args);
  if (result.isErr()) {
    return result;
  }

  const created = result.value;

  return new Ok([
    {
      type: "text" as const,
      text:
        `:skill_suggestion[]{sId=${created.sId} kind=${created.kind} ` +
        `skillId=${created.skillConfigurationSId}}`,
    },
  ]);
}
