import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillCreationArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  suggestSkillIconOrDefault,
  validateSkillCreation,
} from "@app/lib/api/skills/skill_creation";
import type { Authenticator } from "@app/lib/auth";
import { convertHtmlToSkillInstructions } from "@app/lib/editor/skill_instructions_html";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DEFAULT_SKILL_AVAILABILITY } from "@app/types/assistant/skill_configuration";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:achilleburah,label:product;security] draft-is-not-usable
 * `suggestSkillCreation` MUST NOT make the proposed skill usable: the only skill it creates is a
 * `suggested` draft whose sole editor is the caller, and the proposal is recorded as a `pending`
 * `create` suggestion targeting that draft. A freshly drafted skill cannot be the target of any
 * other suggestion, so there is none to mark `outdated`. Activation is the reviewer's accept step.
 */
export async function suggestSkillCreation(
  auth: Authenticator,
  {
    name,
    userFacingDescription,
    agentFacingDescription,
    instructions,
    bypassSimilarSkillCheck,
    analysis,
    title,
  }: SuggestSkillCreationArgs
): Promise<Result<SkillSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting a new skill requires an interactive user context."
      )
    );
  }

  const validation = await validateSkillCreation(auth, {
    name,
    userFacingDescription,
    agentFacingDescription,
    instructions,
    bypassSimilarSkillCheck,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }
  const { user, name: trimmedName } = validation.value;

  const { instructions: instructionsMarkdown, instructionsHtml } =
    convertHtmlToSkillInstructions(instructions);

  const [icon, globalSpace] = await Promise.all([
    suggestSkillIconOrDefault(auth, {
      name: trimmedName,
      instructions: instructionsMarkdown,
      agentFacingDescription,
    }),
    SpaceResource.fetchWorkspaceGlobalSpace(auth),
  ]);

  const draft = await SkillResource.makeNew(
    auth,
    {
      status: "suggested",
      name: trimmedName,
      agentFacingDescription,
      userFacingDescription,
      instructions: instructionsMarkdown,
      instructionsHtml,
      editedBy: user.id,
      requestedSpaceIds: [globalSpace.id],
      icon,
      source: "agent",
      sourceMetadata: null,
      availability: DEFAULT_SKILL_AVAILABILITY,
      reinforcement: "on",
    },
    {
      mcpServerViews: [],
      attachedKnowledge: [],
    }
  );

  // `makeNew` grants the caller the draft's editor role, which `createSuggestionForSkill` requires.
  await auth.refresh();

  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    draft,
    {
      kind: "create",
      suggestion: { name: trimmedName },
      analysis: analysis ?? null,
      title: title ?? null,
      state: "pending",
      source: "conversational",
      sourceConversationIds: null,
    }
  );

  return new Ok(created);
}

export async function suggestSkillCreationHandler(
  args: SuggestSkillCreationArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestSkillCreation(auth, args);
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
