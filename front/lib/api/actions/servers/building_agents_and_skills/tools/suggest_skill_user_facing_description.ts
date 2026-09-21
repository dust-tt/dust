import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillUserFacingDescriptionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import type { Authenticator } from "@app/lib/auth";
import { pruneConflictingSkillUserFacingDescriptionSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isUserFacingDescriptionSkillSuggestion } from "@app/types/suggestions/skill_suggestion";

/**
 * @cc [owner:achilleburah,label:security] requires-skill-write
 * A suggestion MUST only be created for a custom skill the calling user can write; otherwise the
 * call fails with an `MCPError` and no row is created.
 */
export async function suggestSkillUserFacingDescription(
  auth: Authenticator,
  {
    skillId,
    userFacingDescription,
    analysis,
    title,
  }: SuggestSkillUserFacingDescriptionArgs
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting skill description changes requires an interactive user context."
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

  if (skill.status === "archived") {
    return new Err(
      new MCPError("This skill is archived and cannot receive suggestions.")
    );
  }

  if (userFacingDescription.length === 0) {
    return new Err(
      new MCPError("Provide a non-empty `userFacingDescription`.")
    );
  }

  if (userFacingDescription.length > USER_FACING_DESCRIPTION_MAX_LENGTH) {
    return new Err(
      new MCPError(
        `The user-facing description must be at most ${USER_FACING_DESCRIPTION_MAX_LENGTH} characters.`
      )
    );
  }

  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    skill,
    {
      kind: "user_facing_description",
      suggestion: { userFacingDescription },
      analysis: analysis ?? null,
      title: title ?? null,
      state: "pending",
      source: "conversational",
      sourceConversationIds: null,
    }
  );

  if (isUserFacingDescriptionSkillSuggestion(created)) {
    await pruneConflictingSkillUserFacingDescriptionSuggestions(auth, skill, [
      created,
    ]);
  }

  return new Ok(created);
}

export async function suggestSkillUserFacingDescriptionHandler(
  args: SuggestSkillUserFacingDescriptionArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestSkillUserFacingDescription(auth, args);
  if (result.isErr()) {
    return result;
  }

  const created = result.value;

  return new Ok([
    {
      type: "text" as const,
      text: formatSkillSuggestionDirective(created),
    },
  ]);
}
