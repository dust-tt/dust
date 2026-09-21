import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillNameArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { validateSkillNameChange } from "@app/lib/api/skills/name_change";
import type { Authenticator } from "@app/lib/auth";
import { pruneConflictingSkillNameSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isNameSkillSuggestion } from "@app/types/suggestions/skill_suggestion";

export async function suggestSkillName(
  auth: Authenticator,
  { skillId, name, analysis, title }: SuggestSkillNameArgs
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting a skill rename requires an interactive user context."
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

  const validation = await validateSkillNameChange(auth, skill, { name });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  if (validation.value.name === skill.name) {
    return new Err(new MCPError(`The skill is already named "${skill.name}".`));
  }

  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    skill,
    {
      kind: "name",
      suggestion: { name: validation.value.name },
      analysis: analysis ?? null,
      title: title ?? null,
      state: "pending",
      source: "conversational",
      sourceConversationIds: null,
    }
  );

  if (isNameSkillSuggestion(created)) {
    await pruneConflictingSkillNameSuggestions(auth, skill, [created]);
  }

  return new Ok(created);
}

export async function suggestSkillNameHandler(
  args: SuggestSkillNameArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestSkillName(auth, args);
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
