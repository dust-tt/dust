import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillUserFacingDescriptionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { fetchWritableSkill } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import { pruneConflictingSkillUserFacingDescriptionSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isUserFacingDescriptionSkillSuggestion } from "@app/types/suggestions/skill_suggestion";
import assert from "assert";

export async function suggestSkillUserFacingDescription(
  auth: Authenticator,
  {
    skillId,
    userFacingDescription,
    analysis,
    title,
  }: SuggestSkillUserFacingDescriptionArgs,
  runContext: AgentLoopRunContext
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting skill description changes requires an interactive user context."
      )
    );
  }

  const skillResult = await fetchWritableSkill(auth, skillId);
  if (skillResult.isErr()) {
    return new Err(new MCPError(skillResult.error.message));
  }
  const skill = skillResult.value;

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
      sourceConversationIds: [runContext.conversation.id],
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
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestSkillUserFacingDescription(
    auth,
    args,
    runContext
  );
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
