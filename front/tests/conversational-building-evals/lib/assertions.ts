import { extractKnowledgeTagReferences } from "@app/lib/knowledge/format";
import { extractSkillReferenceTags } from "@app/lib/skills/format";
import { extractToolTags } from "@app/lib/tools/format";
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

function getInstructionEditsContent(args: Record<string, unknown>): string {
  if (!Array.isArray(args.instructionEdits)) {
    return "";
  }
  return args.instructionEdits
    .map((edit: unknown) =>
      typeof edit === "object" &&
      edit !== null &&
      "content" in edit &&
      isString(edit.content)
        ? edit.content
        : ""
    )
    .join("\n");
}

// Checks that the instruction edits inline the seeded tools and knowledge documents. Tool tags
// are matched on the seeded MCP server view id; knowledge tags must match the seeded node
// attribute for attribute (id, title, space, dsv), since a wrong one breaks the reference.
function checkInlineReferences(
  args: Record<string, unknown>,
  references: {
    toolKeys?: string[];
    knowledgeKeys?: string[];
    skillKeys?: string[];
  },
  scenario: SeededScenario
): AssertionResult {
  const content = getInstructionEditsContent(args);

  const toolTags = extractToolTags(content);
  for (const key of references.toolKeys ?? []) {
    const toolId = scenario.toolIdsByKey.get(key);
    if (!toolId) {
      throw new Error(`Scenario references unknown tool key "${key}"`);
    }
    if (!toolTags.some((tag) => tag.id === toolId)) {
      return {
        success: false,
        error: `Instruction edits do not inline tool "${key}" (<tool id="${toolId}" .../>); tool tags found: ${JSON.stringify(toolTags)}`,
      };
    }
  }

  const knowledgeTags = extractKnowledgeTagReferences(content);
  for (const key of references.knowledgeKeys ?? []) {
    const node = scenario.knowledgeByKey.get(key);
    if (!node) {
      throw new Error(`Scenario references unknown knowledge key "${key}"`);
    }
    const expectedTag = `<knowledge id="${node.nodeId}" title="${node.title}" space="${node.spaceId}" dsv="${node.dataSourceViewId}" hasChildren="false"/>`;
    const match = knowledgeTags.some(
      (tag) =>
        tag.id === node.nodeId &&
        tag.title === node.title &&
        tag.spaceId === node.spaceId &&
        tag.dataSourceViewId === node.dataSourceViewId
    );
    if (!match) {
      return {
        success: false,
        error: `Instruction edits do not inline knowledge "${key}" exactly as ${expectedTag}; knowledge tags found: ${JSON.stringify(knowledgeTags)}`,
      };
    }
  }

  const skillTags = extractSkillReferenceTags(content);
  for (const key of references.skillKeys ?? []) {
    const skillId = scenario.skillIdsByKey.get(key);
    if (!skillId) {
      throw new Error(`Scenario references unknown skill key "${key}"`);
    }
    if (!skillTags.some((tag) => tag.id === skillId && !tag.unavailable)) {
      return {
        success: false,
        error: `Instruction edits do not inline skill "${key}" (<skill id="${skillId}" .../>); skill tags found: ${JSON.stringify(skillTags)}`,
      };
    }
  }

  return { success: true };
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
      if (assertion.references) {
        return checkInlineReferences(
          finalToolCall.arguments,
          assertion.references,
          scenario
        );
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

// `:build_skill[Name]{sId=xxx}` / `:build_agent[Name]{sId=xxx}`, the directives that render the
// entity as a clickable chip. Only the id matters here: the label is what the model wrote.
const BUILD_SKILL_REGEX = /:build_skill\[[^\]]*\]\{[^}]*sId=([^}\s]+)/g;
const BUILD_AGENT_REGEX = /:build_agent\[[^\]]*\]\{[^}]*sId=([^}\s]+)/g;
// The agent a `suggest_agent_creation` card was recorded for, as the tool's directive spells it.
const AGENT_SUGGESTION_REGEX = /:agent_suggestion\[\]\{[^}]*agentId=([^}\s]+)/g;

function mentionedIds(responseText: string, regex: RegExp): string[] {
  return [...responseText.matchAll(regex)].map((m) => m[1]);
}

/**
 * The response must mention the entity it acted on with its mention directive, so the user can
 * click it open next to the suggestion cards. A created agent has no seeded id, so its mention is
 * checked against the id the `suggest_agent_creation` directive carries.
 */
export function validateEntityMention(
  assertion: FinalToolCallAssertion,
  responseText: string,
  scenario: SeededScenario
): AssertionResult {
  if (assertion.type === "suggestAgentCreation") {
    const [suggestedAgentId] = mentionedIds(
      responseText,
      AGENT_SUGGESTION_REGEX
    );
    if (!suggestedAgentId) {
      return {
        success: false,
        error:
          "Expected the response to carry an :agent_suggestion[] directive to check its mention against",
      };
    }
    const mentioned = mentionedIds(responseText, BUILD_AGENT_REGEX);
    if (!mentioned.includes(suggestedAgentId)) {
      return {
        success: false,
        error:
          `Expected the response to mention the created agent as ` +
          `:build_agent[...]{sId=${suggestedAgentId}}; mentioned ids: ${JSON.stringify(mentioned)}`,
      };
    }
    return { success: true };
  }

  const expectedSkillId = resolveSkillId(scenario, assertion.skillKey);
  const mentioned = mentionedIds(responseText, BUILD_SKILL_REGEX);
  if (!mentioned.includes(expectedSkillId)) {
    return {
      success: false,
      error:
        `Expected the response to mention skill "${assertion.skillKey}" as ` +
        `:build_skill[...]{sId=${expectedSkillId}}; mentioned ids: ${JSON.stringify(mentioned)}`,
    };
  }
  return { success: true };
}
