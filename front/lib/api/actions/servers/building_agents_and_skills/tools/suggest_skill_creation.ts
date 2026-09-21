import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatSkillSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestSkillCreationArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getSimilarSkills } from "@app/lib/api/skills/existing_skill_checker";
import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { extractKnowledgeTagSignatures } from "@app/lib/editor/knowledge_node_constants";
import { convertHtmlToSkillInstructions } from "@app/lib/editor/skill_instructions_html";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { extractUniqueSkillReferenceIds } from "@app/lib/skills/format";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { extractToolTags } from "@app/lib/tools/format";
import logger from "@app/logger/logger";
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
  const user = auth.user();
  if (!user) {
    return new Err(
      new MCPError(
        "Suggesting a new skill requires an interactive user context."
      )
    );
  }

  if (!(await auth.hasWorkspacePermission("create", "skill"))) {
    return new Err(new MCPError("Creating skills is restricted."));
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return new Err(new MCPError("Skill name cannot be empty."));
  }

  if (userFacingDescription.length > USER_FACING_DESCRIPTION_MAX_LENGTH) {
    return new Err(
      new MCPError(
        `The user-facing description must be at most ${USER_FACING_DESCRIPTION_MAX_LENGTH} characters.`
      )
    );
  }

  // The draft has no attachments, so any special tag in the instructions would be dead markup.
  const specialTags = findSpecialTagsPresent(instructions);
  if (specialTags.length > 0) {
    return new Err(
      new MCPError(
        `The instructions contain special tags (${specialTags.join(", ")}) ` +
          "that are wired up in the builder, not authored as plain text. Draft " +
          "instructions-only skills; nested skills, knowledge, and tools must be " +
          "attached in the builder."
      )
    );
  }

  if (await SkillResource.isNameTakenIncludingSuggested(auth, trimmedName)) {
    return new Err(
      new MCPError(`A skill with the name "${trimmedName}" already exists.`)
    );
  }

  if (bypassSimilarSkillCheck !== true) {
    const similar = await findSimilarSkillSummaries(
      auth,
      agentFacingDescription
    );
    if (similar.isErr()) {
      return new Err(similar.error);
    }
    if (similar.value.length > 0) {
      return new Err(new MCPError(makeSimilarSkillsMessage(similar.value)));
    }
  }

  const { instructions: instructionsMarkdown, instructionsHtml } =
    convertHtmlToSkillInstructions(instructions);

  const [icon, globalSpace] = await Promise.all([
    suggestIconOrDefault(auth, {
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

function findSpecialTagsPresent(content: string): string[] {
  const present: string[] = [];
  if (extractUniqueSkillReferenceIds(content).length > 0) {
    present.push("nested skills");
  }
  if (extractKnowledgeTagSignatures(content).length > 0) {
    present.push("knowledge");
  }
  if (extractToolTags(content).length > 0) {
    present.push("tools");
  }

  return present;
}

interface SimilarSkillSummary {
  sId: string;
  name: string;
  agentFacingDescription: string;
}

async function findSimilarSkillSummaries(
  auth: Authenticator,
  naturalDescription: string
): Promise<Result<SimilarSkillSummary[], MCPError>> {
  const result = await getSimilarSkills(auth, {
    naturalDescription,
    excludeSkillId: null,
  });

  if (result.isErr()) {
    logger.warn(
      { err: result.error },
      "Failed to check for similar skills before suggesting a skill"
    );
    return new Err(
      new MCPError(
        "Could not check whether a similar skill already exists. Retry, or set " +
          "`bypassSimilarSkillCheck` to true only if the user explicitly wants " +
          "to propose a separate skill."
      )
    );
  }

  const similarSkillIds = result.value.similar_skills;
  if (similarSkillIds.length === 0) {
    return new Ok([]);
  }

  const skills = await SkillResource.fetchByIds(auth, similarSkillIds);
  const skillsById = new Map(skills.map((skill) => [skill.sId, skill]));

  const summaries: SimilarSkillSummary[] = [];
  for (const skillId of similarSkillIds) {
    const skill = skillsById.get(skillId);
    if (skill) {
      summaries.push({
        sId: skill.sId,
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
      });
    }
  }

  return new Ok(summaries);
}

function makeSimilarSkillsMessage(
  similarSkills: SimilarSkillSummary[]
): string {
  const summaries = similarSkills
    .map(
      (skill) =>
        `- ${skill.name} (${skill.sId}): ${skill.agentFacingDescription}`
    )
    .join("\n");

  return (
    "Similar skills already exist. Reuse or update them instead of proposing a " +
    `duplicate skill:\n${summaries}\n` +
    "If the user explicitly wants a separate skill, call the tool again with " +
    "`bypassSimilarSkillCheck` set to true."
  );
}

async function suggestIconOrDefault(
  auth: Authenticator,
  inputs: {
    name: string;
    instructions: string;
    agentFacingDescription: string;
  }
): Promise<string> {
  const iconResult = await getSkillIconSuggestion(auth, inputs);
  if (iconResult.isOk()) {
    return iconResult.value;
  }

  logger.warn(
    { err: iconResult.error },
    "Failed to generate icon suggestion for drafted skill"
  );
  return "ActionListIcon";
}

export async function suggestSkillCreationHandler(
  args: SuggestSkillCreationArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestSkillCreation(auth, args);
  if (result.isErr()) {
    return result;
  }

  return new Ok([
    {
      type: "text" as const,
      text: formatSkillSuggestionDirective(result.value),
    },
  ]);
}
