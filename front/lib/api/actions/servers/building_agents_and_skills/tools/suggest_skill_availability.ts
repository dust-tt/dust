import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillAvailabilityArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { validateSkillAvailabilityChange } from "@app/lib/api/skills/availability_change";
import { fetchCustomSkillById } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import { pruneConflictingSkillAvailabilitySuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isAvailabilitySkillSuggestion } from "@app/types/suggestions/skill_suggestion";
import assert from "assert";

/**
 * @cc [owner:achilleburah,label:security] requires-skill-write
 * A suggestion MUST only be created for a custom skill the calling user can write; otherwise the
 * call fails with an `MCPError` and no row is created.
 */
export async function suggestSkillAvailability(
  auth: Authenticator,
  { skillId, availability, analysis, title }: SuggestSkillAvailabilityArgs,
  runContext: AgentLoopRunContext
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting a skill availability change requires an interactive user context."
      )
    );
  }

  const skillResult = await fetchCustomSkillById(
    auth,
    skillId,
    "Only custom workspace skills can receive suggestions."
  );
  if (skillResult.isErr()) {
    return new Err(new MCPError(skillResult.error.message));
  }

  const skill = skillResult.value;

  const validation = validateSkillAvailabilityChange(auth, skill, {
    availability,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  if (validation.value === null) {
    return new Err(
      new MCPError(`The skill's availability is already "${availability}".`)
    );
  }

  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    skill,
    {
      kind: "availability",
      suggestion: { availability },
      analysis: analysis ?? null,
      title: title ?? null,
      state: "pending",
      source: "conversational",
      sourceConversationIds: [runContext.conversation.id],
    }
  );

  if (isAvailabilitySkillSuggestion(created)) {
    await pruneConflictingSkillAvailabilitySuggestions(auth, skill, [created]);
  }

  return new Ok(created);
}

export async function suggestSkillAvailabilityHandler(
  args: SuggestSkillAvailabilityArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestSkillAvailability(auth, args, runContext);
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
