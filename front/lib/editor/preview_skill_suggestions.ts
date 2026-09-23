import { mergeSkillSuggestionEdits } from "@app/lib/editor/merge_skill_suggestion_edits";
import type { MarkdownPipeline } from "@app/lib/editor/skill_instructions_html";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import type { DustError } from "@app/lib/error";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

type PreviewedSkillFields = Pick<
  SkillType,
  | "name"
  | "availability"
  | "agentFacingDescription"
  | "userFacingDescription"
  | "instructions"
  | "instructionsHtml"
>;

interface PreviewSkillSuggestionsInput {
  skill: PreviewedSkillFields;
  suggestions: SkillSuggestionType[];
  pipeline: MarkdownPipeline;
}

export function previewSkillSuggestions({
  skill,
  suggestions,
  pipeline,
}: PreviewSkillSuggestionsInput): Result<
  PreviewedSkillFields,
  DustError<"invalid_request_error">
> {
  const edits = mergeSkillSuggestionEdits(suggestions);
  if (edits.isErr()) {
    return edits;
  }

  const {
    name,
    availability,
    agentFacingDescription,
    userFacingDescription,
    instructionEdits,
  } = edits.value;

  const fields = {
    name: name ?? skill.name,
    availability: availability ?? skill.availability,
    agentFacingDescription:
      agentFacingDescription ?? skill.agentFacingDescription,
    userFacingDescription: userFacingDescription ?? skill.userFacingDescription,
  };

  if (!instructionEdits?.length) {
    return new Ok({
      ...fields,
      instructions: skill.instructions,
      instructionsHtml: skill.instructionsHtml,
    });
  }

  const instructions = applyInstructionEditsToHtml(
    skill.instructionsHtml ?? convertMarkdownToBlockHtml("", pipeline),
    instructionEdits,
    pipeline
  );
  if (instructions.isErr()) {
    return instructions;
  }

  return new Ok({ ...fields, ...instructions.value });
}
