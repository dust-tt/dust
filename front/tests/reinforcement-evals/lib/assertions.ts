import type {
  ToolCall,
  ToolCallAssertion,
} from "@app/tests/reinforcement-evals/lib/types";

type AssertionResult = { success: true } | { success: false; error: string };

interface InstructionEditItem {
  old_string: string;
  new_string: string;
}

interface ToolEditItem {
  action: string;
  toolId: string;
}

function isInstructionEditItem(value: unknown): value is InstructionEditItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "old_string" in value &&
    typeof value.old_string === "string"
  );
}

function isToolEditItem(value: unknown): value is ToolEditItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "toolId" in value &&
    typeof value.toolId === "string" &&
    "action" in value &&
    typeof value.action === "string"
  );
}

function getSkillId(args: Record<string, unknown>): string | undefined {
  return typeof args.skillId === "string" ? args.skillId : undefined;
}

function getInstructionEdits(
  args: Record<string, unknown>
): InstructionEditItem[] {
  const edits = args.instructionEdits;
  if (!Array.isArray(edits)) {
    return [];
  }
  return edits.filter(isInstructionEditItem);
}

function getToolEdits(args: Record<string, unknown>): ToolEditItem[] {
  const edits = args.toolEdits;
  if (!Array.isArray(edits)) {
    return [];
  }
  return edits.filter(isToolEditItem);
}

function findEditSkillCall(toolCalls: ToolCall[]): ToolCall | undefined {
  return toolCalls.find((tc) => tc.name === "edit_skill");
}

/**
 * Validate a single assertion against the actual tool calls.
 */
export function validateToolCallAssertion(
  assertion: ToolCallAssertion,
  toolCalls: ToolCall[]
): AssertionResult {
  switch (assertion.type) {
    case "editSkillWithInstructions": {
      const call = findEditSkillCall(toolCalls);
      if (!call) {
        return {
          success: false,
          error: `Expected edit_skill to be called with instructionEdits for skillId "${assertion.skillId}", but edit_skill was not called`,
        };
      }
      const skillId = getSkillId(call.arguments);
      if (skillId !== assertion.skillId) {
        return {
          success: false,
          error: `Expected edit_skill for skillId "${assertion.skillId}", but got skillId "${skillId}"`,
        };
      }
      const instructionEdits = getInstructionEdits(call.arguments);
      if (instructionEdits.length === 0) {
        return {
          success: false,
          error: `Expected edit_skill to contain instructionEdits for skillId "${assertion.skillId}", but instructionEdits is empty or missing`,
        };
      }
      return { success: true };
    }
    case "editSkillWithTool": {
      const call = findEditSkillCall(toolCalls);
      if (!call) {
        return {
          success: false,
          error: `Expected edit_skill to be called with toolEdits for skillId "${assertion.skillId}" and toolId "${assertion.toolId}", but edit_skill was not called`,
        };
      }
      const skillId = getSkillId(call.arguments);
      if (skillId !== assertion.skillId) {
        return {
          success: false,
          error: `Expected edit_skill for skillId "${assertion.skillId}", but got skillId "${skillId}"`,
        };
      }
      const toolEdits = getToolEdits(call.arguments);
      if (!toolEdits.some((t) => t.toolId === assertion.toolId)) {
        return {
          success: false,
          error: `Expected edit_skill to contain toolEdit with toolId "${assertion.toolId}", but got: ${JSON.stringify(toolEdits)}`,
        };
      }
      return { success: true };
    }
    case "editSkill": {
      const call = findEditSkillCall(toolCalls);
      if (!call) {
        return {
          success: false,
          error: `Expected edit_skill to be called for skillId "${assertion.skillId}", but edit_skill was not called`,
        };
      }
      const skillId = getSkillId(call.arguments);
      if (skillId !== assertion.skillId) {
        return {
          success: false,
          error: `Expected edit_skill for skillId "${assertion.skillId}", but got skillId "${skillId}"`,
        };
      }
      return { success: true };
    }
    case "noSuggestion": {
      for (const tc of toolCalls) {
        if (tc.name !== "edit_skill") {
          continue;
        }
        const instructionEdits = getInstructionEdits(tc.arguments);
        const toolEdits = getToolEdits(tc.arguments);
        if (instructionEdits.length > 0 || toolEdits.length > 0) {
          return {
            success: false,
            error: `Expected no suggestions, but edit_skill was called with ${instructionEdits.length} instructionEdit(s) and ${toolEdits.length} toolEdit(s)`,
          };
        }
      }
      return { success: true };
    }
  }
}
