import { TOOL } from "@app/tests/conversational-building-evals/lib/tool-runner";
import type {
  FinalToolCallAssertion,
  SkillUpdateEditKind,
  ToolCall,
} from "@app/tests/conversational-building-evals/lib/types";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";

type AssertionResult = { success: true } | { success: false; error: string };

function hasEdit(
  args: Record<string, unknown>,
  kind: SkillUpdateEditKind
): boolean {
  switch (kind) {
    case "instructionEdits":
      return (
        Array.isArray(args.instructionEdits) && args.instructionEdits.length > 0
      );
    case "agentFacingDescriptionEdit": {
      const edit = args.agentFacingDescriptionEdit;
      return (
        typeof edit === "object" &&
        edit !== null &&
        "content" in edit &&
        isString(edit.content)
      );
    }
    default:
      assertNever(kind);
  }
}

/**
 * Validates the run's final (last non-exploratory) tool call against the scenario expectation.
 * `skillIdsByKey` resolves the scenario's skill keys to the ids assigned at seed time.
 */
export function validateFinalToolCall(
  assertion: FinalToolCallAssertion,
  finalToolCall: ToolCall | null,
  skillIdsByKey: Map<string, string>
): AssertionResult {
  if (!finalToolCall) {
    return {
      success: false,
      error: `Expected the run to end with a suggestion tool call, but no non-exploratory tool was called`,
    };
  }

  switch (assertion.type) {
    case "suggestAgentCreation": {
      if (finalToolCall.name !== TOOL.suggestAgentCreation) {
        return {
          success: false,
          error: `Expected final tool call ${TOOL.suggestAgentCreation}, got ${finalToolCall.name}`,
        };
      }
      return { success: true };
    }
    case "suggestSkillUpdate": {
      if (finalToolCall.name !== TOOL.suggestSkillUpdate) {
        return {
          success: false,
          error: `Expected final tool call ${TOOL.suggestSkillUpdate}, got ${finalToolCall.name}`,
        };
      }
      const expectedSkillId = skillIdsByKey.get(assertion.skillKey);
      if (!expectedSkillId) {
        throw new Error(
          `Scenario references unknown skill key "${assertion.skillKey}"`
        );
      }
      const skillId = finalToolCall.arguments.skillId;
      if (skillId !== expectedSkillId) {
        return {
          success: false,
          error: `Expected ${TOOL.suggestSkillUpdate} on skill "${assertion.skillKey}" (${expectedSkillId}), got "${String(skillId)}"`,
        };
      }
      const required: SkillUpdateEditKind[] = assertion.edits ?? [];
      const missing = required.filter(
        (kind) => !hasEdit(finalToolCall.arguments, kind)
      );
      if (missing.length > 0) {
        return {
          success: false,
          error: `${TOOL.suggestSkillUpdate} is missing ${missing.join(", ")}`,
        };
      }
      if (
        required.length === 0 &&
        !hasEdit(finalToolCall.arguments, "instructionEdits") &&
        !hasEdit(finalToolCall.arguments, "agentFacingDescriptionEdit")
      ) {
        return {
          success: false,
          error: `${TOOL.suggestSkillUpdate} carries neither instructionEdits nor agentFacingDescriptionEdit`,
        };
      }
      return { success: true };
    }
    default:
      assertNever(assertion);
  }
}
