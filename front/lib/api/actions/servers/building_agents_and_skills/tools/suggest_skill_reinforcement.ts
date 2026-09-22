import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { SuggestSkillReinforcementArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { validateSkillReinforcementChange } from "@app/lib/api/skills/reinforcement_change";
import type { Authenticator } from "@app/lib/auth";
import { pruneConflictingSkillReinforcementModeSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isReinforcementModeSkillSuggestion } from "@app/types/suggestions/skill_suggestion";

/**
 * @cc [owner:achilleburah,label:security] requires-skill-write
 * A suggestion MUST only be created for a custom skill the calling user can write; otherwise the
 * call fails with an `MCPError` and no row is created. `canAdministrate` does not imply `canWrite`
 * (`skill-verbs`), so a workspace admin who is not an editor is refused here even though the
 * manual route would let them change the mode.
 */
export async function suggestSkillReinforcement(
  auth: Authenticator,
  { skillId, reinforcement, analysis, title }: SuggestSkillReinforcementArgs
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting a self-improvement change requires an interactive user context."
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

  const validation = await validateSkillReinforcementChange(auth, skill, {
    reinforcement,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  if (reinforcement === skill.reinforcement) {
    return new Err(
      new MCPError(
        `The skill's self-improvement mode is already "${reinforcement}".`
      )
    );
  }

  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    skill,
    {
      kind: "reinforcement",
      suggestion: { reinforcement },
      analysis: analysis ?? null,
      title: title ?? null,
      state: "pending",
      source: "conversational",
      sourceConversationIds: null,
    }
  );

  if (isReinforcementModeSkillSuggestion(created)) {
    await pruneConflictingSkillReinforcementModeSuggestions(auth, skill, [
      created,
    ]);
  }

  return new Ok(created);
}

export async function suggestSkillReinforcementHandler(
  args: SuggestSkillReinforcementArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestSkillReinforcement(auth, args);
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
