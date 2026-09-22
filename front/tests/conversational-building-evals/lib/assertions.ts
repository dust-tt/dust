import { TOOL } from "@app/tests/conversational-building-evals/lib/tool-runner";
import type {
  FinalToolCallAssertion,
  SeededScenario,
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

function resolveSkillId(scenario: SeededScenario, skillKey: string): string {
  const skillId = scenario.skillIdsByKey.get(skillKey);
  if (!skillId) {
    throw new Error(`Scenario references unknown skill key "${skillKey}"`);
  }
  return skillId;
}

function resolveMemberId(scenario: SeededScenario, memberKey: string): string {
  const memberId = scenario.memberIdsByKey.get(memberKey);
  if (!memberId) {
    throw new Error(`Scenario references unknown member key "${memberKey}"`);
  }
  return memberId;
}

// Shared check for every skill-targeted suggestion: right tool, right skill.
function checkSkillToolCall(
  finalToolCall: ToolCall,
  expectedToolName: string,
  scenario: SeededScenario,
  skillKey: string
): AssertionResult {
  if (finalToolCall.name !== expectedToolName) {
    return {
      success: false,
      error: `Expected final tool call ${expectedToolName}, got ${finalToolCall.name}`,
    };
  }
  const expectedSkillId = resolveSkillId(scenario, skillKey);
  const skillId = finalToolCall.arguments.skillId;
  if (skillId !== expectedSkillId) {
    return {
      success: false,
      error: `Expected ${expectedToolName} on skill "${skillKey}" (${expectedSkillId}), got "${String(skillId)}"`,
    };
  }
  return { success: true };
}

/**
 * Validates the run's final (last non-exploratory) tool call against the scenario expectation.
 * Skill and member keys are resolved to the ids assigned at seed time.
 */
export function validateFinalToolCall(
  assertion: FinalToolCallAssertion,
  finalToolCall: ToolCall | null,
  scenario: SeededScenario
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
      const base = checkSkillToolCall(
        finalToolCall,
        TOOL.suggestSkillUpdate,
        scenario,
        assertion.skillKey
      );
      if (!base.success) {
        return base;
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

    case "suggestSkillEditors": {
      const base = checkSkillToolCall(
        finalToolCall,
        TOOL.suggestSkillEditors,
        scenario,
        assertion.skillKey
      );
      if (!base.success) {
        return base;
      }
      const addUserIds = Array.isArray(finalToolCall.arguments.addUserIds)
        ? finalToolCall.arguments.addUserIds.filter(isString)
        : [];
      const missing = (assertion.addMemberKeys ?? []).filter(
        (key) => !addUserIds.includes(resolveMemberId(scenario, key))
      );
      if (missing.length > 0) {
        return {
          success: false,
          error: `${TOOL.suggestSkillEditors} does not add member(s) ${missing.join(", ")}; addUserIds=${JSON.stringify(addUserIds)}`,
        };
      }
      return { success: true };
    }

    case "suggestSkillDeletion":
      return checkSkillToolCall(
        finalToolCall,
        TOOL.suggestSkillDeletion,
        scenario,
        assertion.skillKey
      );

    case "suggestSkillName":
      return checkSkillToolCall(
        finalToolCall,
        TOOL.suggestSkillName,
        scenario,
        assertion.skillKey
      );

    case "suggestSkillAvailability": {
      const base = checkSkillToolCall(
        finalToolCall,
        TOOL.suggestSkillAvailability,
        scenario,
        assertion.skillKey
      );
      if (!base.success) {
        return base;
      }
      if (
        assertion.availability !== undefined &&
        finalToolCall.arguments.availability !== assertion.availability
      ) {
        return {
          success: false,
          error: `Expected availability "${assertion.availability}", got "${String(finalToolCall.arguments.availability)}"`,
        };
      }
      return { success: true };
    }

    case "suggestSkillUserFacingDescription":
      return checkSkillToolCall(
        finalToolCall,
        TOOL.suggestSkillUserFacingDescription,
        scenario,
        assertion.skillKey
      );

    default:
      assertNever(assertion);
  }
}
