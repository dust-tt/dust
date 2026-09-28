import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillAvailabilityArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  recordSkillSuggestion,
  validateSkillAvailabilitySuggestion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/skill_suggestion_changes";
import { fetchCustomSkillById } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
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

  const validation = validateSkillAvailabilitySuggestion(auth, skill, {
    availability,
  });
  if (validation.isErr()) {
    return validation;
  }

  return new Ok(
    await recordSkillSuggestion(auth, skill, {
      data: { kind: "availability", suggestion: validation.value },
      analysis: analysis ?? null,
      title: title ?? null,
      conversation: runContext.conversation,
      batch: null,
    })
  );
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
