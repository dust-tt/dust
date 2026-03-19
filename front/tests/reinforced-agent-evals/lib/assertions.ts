import type {
  ToolCall,
  ToolCallAssertion,
} from "@app/tests/reinforced-agent-evals/lib/types";

type AssertionResult = { success: true } | { success: false; error: string };

interface ToolSuggestionItem {
  toolId: string;
  action: string;
}

interface SkillSuggestionItem {
  skillId: string;
  action: string;
}

function isToolSuggestionItem(value: unknown): value is ToolSuggestionItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "toolId" in value &&
    typeof value.toolId === "string" &&
    "action" in value &&
    typeof value.action === "string"
  );
}

function isSkillSuggestionItem(value: unknown): value is SkillSuggestionItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "skillId" in value &&
    typeof value.skillId === "string" &&
    "action" in value &&
    typeof value.action === "string"
  );
}

interface PromptSuggestionItem {
  targetBlockId: string;
}

function isPromptSuggestionItem(value: unknown): value is PromptSuggestionItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "targetBlockId" in value &&
    typeof value.targetBlockId === "string"
  );
}

function getSuggestions(args: Record<string, unknown>): unknown[] | undefined {
  const suggestions = args.suggestions;
  if (!Array.isArray(suggestions)) {
    return undefined;
  }
  return suggestions;
}

function getToolSuggestions(
  args: Record<string, unknown>
): ToolSuggestionItem[] {
  return (getSuggestions(args) ?? []).filter(isToolSuggestionItem);
}

function getSkillSuggestions(
  args: Record<string, unknown>
): SkillSuggestionItem[] {
  return (getSuggestions(args) ?? []).filter(isSkillSuggestionItem);
}

function getPromptSuggestions(
  args: Record<string, unknown>
): PromptSuggestionItem[] {
  return (getSuggestions(args) ?? []).filter(isPromptSuggestionItem);
}

/**
 * Validate a single assertion against the actual tool calls.
 */
export function validateToolCallAssertion(
  assertion: ToolCallAssertion,
  toolCalls: ToolCall[]
): AssertionResult {
  switch (assertion.type) {
    case "toolSuggestion": {
      const call = toolCalls.find((tc) => tc.name === "suggest_tools");
      if (!call) {
        return {
          success: false,
          error: `Expected suggest_tools to be called with toolId "${assertion.toolId}", but suggest_tools was not called`,
        };
      }
      const suggestions = getToolSuggestions(call.arguments);
      if (!suggestions.some((s) => s.toolId === assertion.toolId)) {
        return {
          success: false,
          error: `Expected suggest_tools to contain toolId "${assertion.toolId}", but got: ${JSON.stringify(suggestions)}`,
        };
      }
      return { success: true };
    }
    case "skillSuggestion": {
      const call = toolCalls.find((tc) => tc.name === "suggest_skills");
      if (!call) {
        return {
          success: false,
          error: `Expected suggest_skills to be called with skillId "${assertion.skillId}", but suggest_skills was not called`,
        };
      }
      const suggestions = getSkillSuggestions(call.arguments);
      if (!suggestions.some((s) => s.skillId === assertion.skillId)) {
        return {
          success: false,
          error: `Expected suggest_skills to contain skillId "${assertion.skillId}", but got: ${JSON.stringify(suggestions)}`,
        };
      }
      return { success: true };
    }
    case "promptSuggestion": {
      const call = toolCalls.find((tc) => tc.name === "suggest_prompt_edits");
      if (!call) {
        return {
          success: false,
          error: "Expected suggest_prompt_edits to be called, but it was not",
        };
      }
      const suggestions = getPromptSuggestions(call.arguments);
      if (suggestions.length === 0) {
        return {
          success: false,
          error:
            "Expected suggest_prompt_edits to contain at least one suggestion, but got none",
        };
      }
      if (
        assertion.targetBlockId &&
        !suggestions.some((s) => s.targetBlockId === assertion.targetBlockId)
      ) {
        return {
          success: false,
          error: `Expected suggest_prompt_edits to contain targetBlockId "${assertion.targetBlockId}", but got: ${JSON.stringify(suggestions.map((s) => s.targetBlockId))}`,
        };
      }
      return { success: true };
    }
    case "noSuggestion": {
      const suggestionToolNames = new Set([
        "suggest_tools",
        "suggest_skills",
        "suggest_prompt_edits",
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
