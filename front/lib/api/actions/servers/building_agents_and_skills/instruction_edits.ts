import { MCPError } from "@app/lib/actions/mcp_errors";
import { validateInstructionEdits } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { findUnknownTargetBlockIds } from "@app/lib/editor/instructions_block_conflict";
import { hasSuggestionSelfConflict } from "@app/lib/reinforcement/skill_suggestion_pruning";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { SkillInstructionEditItemType } from "@app/types/suggestions/skill_suggestion";

export function validateInstructionEditTargets(
  instructionsHtml: string,
  instructionEdits: SkillInstructionEditItemType[],
  owner: "agent" | "skill"
): Result<undefined, MCPError> {
  const editsValidation = validateInstructionEdits(instructionEdits);
  if (editsValidation.isErr()) {
    return new Err(new MCPError(editsValidation.error));
  }

  const unknownBlockIds = findUnknownTargetBlockIds(
    instructionsHtml,
    instructionEdits.map((edit) => edit.targetBlockId)
  );
  if (unknownBlockIds.length > 0) {
    return new Err(
      new MCPError(
        `These blocks do not exist in the ${owner}'s instructions: ${unknownBlockIds.join(", ")}.`
      )
    );
  }

  if (hasSuggestionSelfConflict({ instructionEdits }, instructionsHtml)) {
    return new Err(
      new MCPError(
        "The suggested instruction edits overlap (a block and one of its descendants are " +
          "both targeted). Target each region of the instructions only once."
      )
    );
  }

  return new Ok(undefined);
}
