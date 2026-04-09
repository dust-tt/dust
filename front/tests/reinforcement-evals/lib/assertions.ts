import type {
  ToolCall,
  ToolCallAssertion,
} from "@app/tests/reinforcement-evals/lib/types";

type AssertionResult = { success: true } | { success: false; error: string };

interface InstructionSuggestionItem {
  skillId: string;
}

interface ToolSuggestionItem {
  skillId: string;
  toolId: string;
  action: string;
}

function isInstructionSuggestionItem(
  value: unknown
): value is InstructionSuggestionItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "skillId" in value &&
    typeof value.skillId === "string"
  );
}

function isToolSuggestionItem(value: unknown): value is ToolSuggestionItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "skillId" in value &&
    typeof value.skillId === "string" &&
    "toolId" in value &&
    typeof value.toolId === "string" &&
    "action" in value &&
    typeof value.action === "string"
  );
}

function getSuggestions(args: Record<string, unknown>): unknown[] | undefined {
  const suggestions = args.suggestions;
  if (!Array.isArray(suggestions)) {
    return undefined;
  }
  return suggestions;
}

function getInstructionSuggestions(
  args: Record<string, unknown>
): InstructionSuggestionItem[] {
  return (getSuggestions(args) ?? []).filter(isInstructionSuggestionItem);
}

function getToolSuggestions(
  args: Record<string, unknown>
): ToolSuggestionItem[] {
  return (getSuggestions(args) ?? []).filter(isToolSuggestionItem);
}

/**
 * Validate a single assertion against the actual tool calls.
 */
export function validateToolCallAssertion(
  assertion: ToolCallAssertion,
  toolCalls: ToolCall[]
): AssertionResult {
  switch (assertion.type) {
    case "instructionSuggestion": {
      const call = toolCalls.find(
        (tc) => tc.name === "suggest_skill_instruction_edits"
      );
      if (!call) {
        return {
          success: false,
          error: `Expected suggest_skill_instruction_edits to be called with skillId "${assertion.skillId}", but suggest_skill_instruction_edits was not called`,
        };
      }
      const suggestions = getInstructionSuggestions(call.arguments);
      if (!suggestions.some((s) => s.skillId === assertion.skillId)) {
        return {
          success: false,
          error: `Expected suggest_skill_instruction_edits to contain skillId "${assertion.skillId}", but got: ${JSON.stringify(suggestions)}`,
        };
      }
      return { success: true };
    }
    case "toolSuggestion": {
      const call = toolCalls.find((tc) => tc.name === "suggest_skill_tools");
      if (!call) {
        return {
          success: false,
          error: `Expected suggest_skill_tools to be called with skillId "${assertion.skillId}" and toolId "${assertion.toolId}", but suggest_skill_tools was not called`,
        };
      }
      const suggestions = getToolSuggestions(call.arguments);
      if (
        !suggestions.some(
          (s) =>
            s.skillId === assertion.skillId && s.toolId === assertion.toolId
        )
      ) {
        return {
          success: false,
          error: `Expected suggest_skill_tools to contain skillId "${assertion.skillId}" with toolId "${assertion.toolId}", but got: ${JSON.stringify(suggestions)}`,
        };
      }
      return { success: true };
    }
    case "noSuggestion": {
      const suggestionToolNames = new Set([
        "suggest_skill_instruction_edits",
        "suggest_skill_tools",
      ]);
      for (const tc of toolCalls) {
        if (!suggestionToolNames.has(tc.name)) {
          continue;
        }
        const suggestions = getSuggestions(tc.arguments);
        if (suggestions && suggestions.length > 0) {
          return {
            success: false,
            error: `Expected no suggestions, but ${tc.name} was called with ${suggestions.length} suggestion(s)`,
          };
        }
      }
      return { success: true };
    }
  }
}
