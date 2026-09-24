import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillDeletionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  recordSkillSuggestion,
  validateSkillDeletionSuggestion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/skill_suggestion_changes";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

export async function suggestSkillDeletion(
  auth: Authenticator,
  { skillId, analysis }: SuggestSkillDeletionArgs,
  runContext: AgentLoopRunContext
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting a skill deletion requires an interactive user context."
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

  const validation = validateSkillDeletionSuggestion(auth, skill);
  if (validation.isErr()) {
    return validation;
  }

  return new Ok(
    await recordSkillSuggestion(auth, skill, {
      data: { kind: "delete", suggestion: validation.value },
      analysis: analysis ?? null,
      title: null,
      conversation: runContext.conversation,
      batch: null,
    })
  );
}

export async function suggestSkillDeletionHandler(
  args: SuggestSkillDeletionArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestSkillDeletion(auth, args, runContext);
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
