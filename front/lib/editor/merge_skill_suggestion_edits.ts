import { DustError } from "@app/lib/error";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type {
  SkillInstructionEditItemType,
  SkillSuggestionType,
} from "@app/types/suggestions/skill_suggestion";
import { SkillSuggestionDataSchema } from "@app/types/suggestions/skill_suggestion";

export interface SkillEdits {
  agentFacingDescription?: string;
  userFacingDescription?: string;
  name?: string;
  availability?: SkillAvailability;
  editors?: { addUserIds: string[]; removeUserIds: string[] };
  instructionEdits?: SkillInstructionEditItemType[];
  archive?: boolean;
}

type SkillSuggestionEditsInput = Pick<
  SkillSuggestionType,
  "kind" | "suggestion"
>;

function editsForSuggestion(
  suggestion: SkillSuggestionEditsInput
): Result<SkillEdits, DustError<"invalid_request_error">> {
  const parsed = SkillSuggestionDataSchema.safeParse({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });
  if (!parsed.success) {
    return new Err(
      new DustError("invalid_request_error", "Unsupported skill suggestion.")
    );
  }

  const data = parsed.data;
  switch (data.kind) {
    case "availability":
      return new Ok({ availability: data.suggestion.availability });

    case "create":
      return new Err(
        new DustError(
          "invalid_request_error",
          "Skill creation suggestions cannot be applied to the skill yet."
        )
      );

    case "delete":
      return new Ok({ archive: true });

    case "edit":
      return new Ok({
        agentFacingDescription:
          data.suggestion.agentFacingDescriptionEdit?.content,
        instructionEdits: data.suggestion.instructionEdits,
      });

    case "editors":
      return new Ok({ editors: data.suggestion });

    case "name":
      return new Ok({ name: data.suggestion.name });

    case "user_facing_description":
      return new Ok({
        userFacingDescription: data.suggestion.userFacingDescription,
      });

    default:
      assertNeverAndIgnore(data);
      return new Err(
        new DustError("invalid_request_error", "Unsupported skill suggestion.")
      );
  }
}

/**
 * Folds what every accepted suggestion asks for into one set of changes, so a batch produces one
 * skill version.
 */
function mergeSkillEdits(edits: SkillEdits[]): SkillEdits {
  const agentFacingDescription = edits.reduce<string | undefined>(
    (merged, next) => next.agentFacingDescription ?? merged,
    undefined
  );
  const userFacingDescription = edits.reduce<string | undefined>(
    (merged, next) => next.userFacingDescription ?? merged,
    undefined
  );
  const name = edits.reduce<string | undefined>(
    (merged, next) => next.name ?? merged,
    undefined
  );
  const availability = edits.reduce<SkillAvailability | undefined>(
    (merged, next) => next.availability ?? merged,
    undefined
  );

  // Concatenated in suggestion order: every accepted edit is applied, each to its own block.
  const instructionEdits = edits.flatMap((e) => e.instructionEdits ?? []);

  const archive = edits.some((e) => e.archive);

  // Union, not last-wins: approving two suggestions must apply both editor changes.
  const editorsEdits = edits.flatMap((e) => e.editors ?? []);
  if (editorsEdits.length === 0) {
    return {
      agentFacingDescription,
      userFacingDescription,
      name,
      availability,
      instructionEdits,
      archive,
    };
  }

  return {
    agentFacingDescription,
    userFacingDescription,
    name,
    availability,
    instructionEdits,
    archive,
    editors: {
      addUserIds: [...new Set(editorsEdits.flatMap((e) => e.addUserIds))],
      removeUserIds: [...new Set(editorsEdits.flatMap((e) => e.removeUserIds))],
    },
  };
}

export function mergeSkillSuggestionEdits(
  suggestions: SkillSuggestionEditsInput[]
): Result<SkillEdits, DustError<"invalid_request_error">> {
  const perSuggestionEdits: SkillEdits[] = [];

  for (const suggestion of suggestions) {
    const suggestionEdits = editsForSuggestion(suggestion);
    if (suggestionEdits.isErr()) {
      return suggestionEdits;
    }

    perSuggestionEdits.push(suggestionEdits.value);
  }

  return new Ok(mergeSkillEdits(perSuggestionEdits));
}
