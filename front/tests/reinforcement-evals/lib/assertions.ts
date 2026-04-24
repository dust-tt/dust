import { DESCRIBE_MCP_TOOL_NAME } from "@app/lib/reinforcement/types";
import type {
  ToolCall,
  ToolCallAssertion,
} from "@app/tests/reinforcement-evals/lib/types";
import { isString } from "@app/types/shared/utils/general";

type AssertionResult = { success: true } | { success: false; error: string };

interface InstructionEditItem {
  targetBlockId: string;
  content: string;
  type: string;
}

interface ToolEditItem {
  action: string;
  toolId: string;
}

function isInstructionEditItem(value: unknown): value is InstructionEditItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "targetBlockId" in value &&
    typeof value.targetBlockId === "string"
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
  return isString(args.skillId) ? args.skillId : undefined;
}

function getSourceSuggestionIds(args: Record<string, unknown>): string[] {
  const ids = args.sourceSuggestionIds;
  if (!Array.isArray(ids)) {
    return [];
  }
  return ids.filter(isString);
}

function validateSourceSuggestionIds(
  call: ToolCall,
  expectedIds: string[]
): AssertionResult | null {
  const actualIds = getSourceSuggestionIds(call.arguments);
  const expectedSet = new Set(expectedIds);
  const actualSet = new Set(actualIds);
  if (
    expectedSet.size !== actualSet.size ||
    [...expectedSet].some((id) => !actualSet.has(id))
  ) {
    return {
      success: false,
      error: `Expected sourceSuggestionIds ${JSON.stringify([...expectedSet].sort())} but got ${JSON.stringify([...actualSet].sort())}`,
    };
  }
  return null;
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
      if (assertion.sourceSuggestionIds) {
        const sourceResult = validateSourceSuggestionIds(
          call,
          assertion.sourceSuggestionIds
        );
        if (sourceResult) {
          return sourceResult;
        }
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
      if (assertion.sourceSuggestionIds) {
        const sourceResult = validateSourceSuggestionIds(
          call,
          assertion.sourceSuggestionIds
        );
        if (sourceResult) {
          return sourceResult;
        }
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
      if (assertion.sourceSuggestionIds) {
        const sourceResult = validateSourceSuggestionIds(
          call,
          assertion.sourceSuggestionIds
        );
        if (sourceResult) {
          return sourceResult;
        }
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
    case "editSkillCallCount": {
      const actual = toolCalls.filter((tc) => tc.name === "edit_skill").length;
      if (actual !== assertion.count) {
        return {
          success: false,
          error: `Expected exactly ${assertion.count} edit_skill call(s), but got ${actual}`,
        };
      }
      return { success: true };
    }
    case "editSkillCallsWithSources": {
      const editCalls = toolCalls.filter((tc) => tc.name === "edit_skill");
      const expectedCount = assertion.sourceSuggestionIdGroups.length;
      if (editCalls.length !== expectedCount) {
        return {
          success: false,
          error: `Expected exactly ${expectedCount} edit_skill call(s), but got ${editCalls.length}`,
        };
      }
      // Each call's sourceSuggestionIds must match exactly one group (order-independent).
      const remainingGroups = assertion.sourceSuggestionIdGroups.map(
        (g) => new Set(g)
      );
      for (const call of editCalls) {
        const actualIds = new Set(getSourceSuggestionIds(call.arguments));
        const matchIdx = remainingGroups.findIndex(
          (group) =>
            group.size === actualIds.size &&
            [...group].every((id) => actualIds.has(id))
        );
        if (matchIdx === -1) {
          return {
            success: false,
            error: `edit_skill call has sourceSuggestionIds ${JSON.stringify([...actualIds].sort())} which does not match any expected group: ${JSON.stringify(assertion.sourceSuggestionIdGroups.map((g) => g.sort()))}`,
          };
        }
        remainingGroups.splice(matchIdx, 1);
      }
      return { success: true };
    }
    case "rejectSuggestion": {
      const rejectCalls = toolCalls.filter(
        (tc) => tc.name === "reject_suggestion"
      );
      if (rejectCalls.length === 0) {
        return {
          success: false,
          error: `Expected reject_suggestion to be called with sourceSuggestionIds ${JSON.stringify(assertion.sourceSuggestionIds.sort())}, but reject_suggestion was not called`,
        };
      }
      const allRejectedIds = new Set(
        rejectCalls.flatMap((tc) => getSourceSuggestionIds(tc.arguments))
      );
      const expectedSet = new Set(assertion.sourceSuggestionIds);
      if (
        expectedSet.size !== allRejectedIds.size ||
        [...expectedSet].some((id) => !allRejectedIds.has(id))
      ) {
        return {
          success: false,
          error: `Expected reject_suggestion sourceSuggestionIds ${JSON.stringify([...expectedSet].sort())} but got ${JSON.stringify([...allRejectedIds].sort())}`,
        };
      }
      return { success: true };
    }
    case "calledDescribeMcp": {
      const called = toolCalls.some(
        (tc) =>
          tc.name === DESCRIBE_MCP_TOOL_NAME &&
          isString(tc.arguments["mcpId"]) &&
          tc.arguments["mcpId"] === assertion.mcpId
      );
      if (!called) {
        return {
          success: false,
          error: `Expected ${DESCRIBE_MCP_TOOL_NAME} to be called with mcpId "${assertion.mcpId}", but it was not`,
        };
      }
      return { success: true };
    }
  }
}
