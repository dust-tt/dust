import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillUserFacingDescriptionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  recordSkillSuggestion,
  validateSkillUserFacingDescriptionSuggestion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/skill_suggestion_changes";
import { fetchWritableSkill } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
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

  const validation = validateSkillUserFacingDescriptionSuggestion(auth, skill, {
    userFacingDescription,
  });
  if (validation.isErr()) {
    return validation;
  }

  return new Ok(
    await recordSkillSuggestion(auth, skill, {
      data: { kind: "user_facing_description", suggestion: validation.value },
      analysis: analysis ?? null,
      title: title ?? null,
      conversation: runContext.conversation,
      batch: null,
    })
  );
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
