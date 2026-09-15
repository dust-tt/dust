import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { SuggestSkillEditorsArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { validateSkillEditorsChange } from "@app/lib/api/skills/editors_change";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:achilleburah,label:security] editors-suggestion-requires-administrate
 * An editors suggestion MUST only be created by a caller who could perform the same change
 * manually (`validateSkillEditorsChange`); otherwise the call fails with an `MCPError` and no row
 * is created. Validation only gates creation: the change is re-validated when the suggestion is
 * approved.
 */
export async function suggestSkillEditors(
  auth: Authenticator,
  {
    skillId,
    addUserIds = [],
    removeUserIds = [],
    analysis,
    title,
  }: SuggestSkillEditorsArgs
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting skill editors changes requires an interactive user context."
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

  if (addUserIds.length === 0 && removeUserIds.length === 0) {
    return new Err(
      new MCPError(
        "Provide at least one user in `addUserIds` or `removeUserIds`."
      )
    );
  }

  const validation = await validateSkillEditorsChange(auth, skill, {
    addUserIds,
    removeUserIds,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  // `createSuggestionForSkill` only requires `canWrite`, which `canAdministrate` implies.
  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    skill,
    {
      kind: "editors",
      suggestion: { addUserIds, removeUserIds },
      analysis: analysis ?? null,
      title: title ?? null,
      state: "pending",
      source: "conversational",
      sourceConversationIds: null,
    }
  );

  return new Ok(created);
}

export async function suggestSkillEditorsHandler(
  args: SuggestSkillEditorsArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestSkillEditors(auth, args);
  if (result.isErr()) {
    return result;
  }

  const created = result.value;

  return new Ok([
    {
      type: "text" as const,
      text: `:skill_suggestion[]{sId=${created.sId} kind=${created.kind}}`,
    },
  ]);
}
