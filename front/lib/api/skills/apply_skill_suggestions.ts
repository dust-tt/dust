import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { parseSkillSuggestionData } from "@app/types/suggestions/skill_suggestion";

/**
 * What a suggestion asks to change on the skill.
 */
interface SkillEdits {
  agentFacingDescription?: string;
}

function editsForSuggestion(
  suggestion: SkillSuggestionResource
): Result<SkillEdits, DustError<"invalid_request_error">> {
  const data = parseSkillSuggestionData({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });

  switch (data.kind) {
    case "edit":
      if (data.suggestion.instructionEdits?.length) {
        return new Err(
          new DustError(
            "invalid_request_error",
            "Instruction edits cannot be applied to the skill yet."
          )
        );
      }

      return new Ok({
        agentFacingDescription:
          data.suggestion.agentFacingDescriptionEdit?.content,
      });

    case "editors":
      return new Err(
        new DustError(
          "invalid_request_error",
          "Editors suggestions cannot be applied to the skill yet."
        )
      );

    default:
      assertNever(data);
  }
}

/**
 * Folds what every accepted suggestion asks for into one set of changes, so a batch produces one
 * skill version.
 */
function mergeSkillEdits(edits: SkillEdits[]): SkillEdits {
  return edits.reduce<SkillEdits>(
    (merged, next) => ({
      agentFacingDescription:
        next.agentFacingDescription ?? merged.agentFacingDescription,
    }),
    {}
  );
}

export async function applySkillSuggestions(
  auth: Authenticator,
  {
    skill,
    suggestions,
  }: { skill: SkillResource; suggestions: SkillSuggestionResource[] }
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  const perSuggestionEdits: SkillEdits[] = [];

  for (const suggestion of suggestions) {
    const suggestionEdits = editsForSuggestion(suggestion);
    if (suggestionEdits.isErr()) {
      return suggestionEdits;
    }

    perSuggestionEdits.push(suggestionEdits.value);
  }

  const edits = mergeSkillEdits(perSuggestionEdits);

  const attachedKnowledge = await skill.getAttachedKnowledge(auth);

  // `updateSkill` replaces the whole skill, so every field no suggestion touched is carried over
  // from the current values.
  await skill.updateSkill(auth, {
    agentFacingDescription:
      edits.agentFacingDescription ?? skill.agentFacingDescription,
    attachedKnowledge,
    icon: skill.icon,
    instructions: skill.instructions,
    instructionsHtml: skill.instructionsHtml,
    manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    mcpServerViews: skill.mcpServerViews,
    name: skill.name,
    requestedSpaceIds: skill.requestedSpaceIds,
    userFacingDescription: skill.userFacingDescription,
  });

  return new Ok(undefined);
}
