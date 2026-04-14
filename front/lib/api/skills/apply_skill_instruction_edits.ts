import type { SkillInstructionEditItemType } from "@app/types/suggestions/skill_suggestion";

function countSubstringOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

export function getSkillInstructionEditsValidationError(
  instructions: string,
  edits: SkillInstructionEditItemType[]
): string | null {
  let current = instructions;
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const count = countSubstringOccurrences(current, edit.old_string);
    if (count !== edit.expected_occurrences) {
      return `Edit ${i + 1}: expected ${edit.expected_occurrences} occurrence(s) of old_string but found ${count}.`;
    }
    current = current.replaceAll(edit.old_string, edit.new_string);
  }
  return null;
}
