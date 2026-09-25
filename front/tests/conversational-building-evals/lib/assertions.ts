import { extractKnowledgeTagReferences } from "@app/lib/knowledge/format";
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
import type { SkillInstructionEditItemType } from "@app/types/suggestions/skill_suggestion";
import { SkillInstructionEditItemSchema } from "@app/types/suggestions/skill_suggestion";

type AssertionResult = { success: true } | { success: false; error: string };

// Type guard over the production edit schema, so the assertions read the tool arguments the way
// the tool validates them.
function isInstructionEditItem(
  value: unknown
): value is SkillInstructionEditItemType {
  return SkillInstructionEditItemSchema.safeParse(value).success;
}

// One item of the `suggestions` argument of a `suggest` call.
type SuggestionItem = Record<string, unknown>;

function isSuggestionItem(value: unknown): value is SuggestionItem {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasEdit(item: SuggestionItem, kind: SkillUpdateEditKind): boolean {
  switch (kind) {
    case "instructionEdits":
      return (
        Array.isArray(item.instructionEdits) && item.instructionEdits.length > 0
      );
    case "agentFacingDescription":
      return (
        isString(item.agentFacingDescription) &&
        item.agentFacingDescription.length > 0
      );
    default:
      assertNever(kind);
  }
}

type FindSuggestionResult =
  | { success: true; item: SuggestionItem }
  | { success: false; error: string };

/**
 * Finds, in the final `suggest` call, the suggestion of `kind` whose `targetField` is `targetId`
 * (any suggestion of `kind` when no target is given, e.g. a creation).
 */
function findSuggestion(
  finalToolCall: ToolCall,
  kind: string,
  target?: { field: string; id: string; label: string }
): FindSuggestionResult {
  if (finalToolCall.name !== TOOL.suggest) {
    return {
      success: false,
      error: `Expected final tool call ${TOOL.suggest}, got ${finalToolCall.name}`,
    };
  }
  const suggestions = Array.isArray(finalToolCall.arguments.suggestions)
    ? finalToolCall.arguments.suggestions.filter(isSuggestionItem)
    : [];
  const item = suggestions.find(
    (s) => s.kind === kind && (!target || s[target.field] === target.id)
  );
  if (!item) {
    return {
      success: false,
      error:
        `Expected a "${kind}" suggestion${target ? ` on ${target.label} (${target.id})` : ""} ` +
        `in the final ${TOOL.suggest} call; suggestions: ${JSON.stringify(suggestions)}`,
    };
  }
  return { success: true, item };
}

function resolveSkillId(scenario: SeededScenario, skillKey: string): string {
  const skillId = scenario.skillIdsByKey.get(skillKey);
  if (!skillId) {
    throw new Error(`Scenario references unknown skill key "${skillKey}"`);
  }
  return skillId;
}

function resolveAgentId(scenario: SeededScenario, agentKey: string): string {
  const agentId = scenario.agentIdsByKey.get(agentKey);
  if (!agentId) {
    throw new Error(`Scenario references unknown agent key "${agentKey}"`);
  }
  return agentId;
}

function resolveMemberId(scenario: SeededScenario, memberKey: string): string {
  const memberId = scenario.memberIdsByKey.get(memberKey);
  if (!memberId) {
    throw new Error(`Scenario references unknown member key "${memberKey}"`);
  }
  return memberId;
}

function getInstructionEditsContent(args: SuggestionItem): string {
  if (!Array.isArray(args.instructionEdits)) {
    return "";
  }
  return args.instructionEdits
    .filter(isInstructionEditItem)
    .map((edit) => edit.content)
    .join("\n");
}

// Checks that the instruction edits inline the seeded tools and knowledge documents. Tool tags
// are matched on the seeded MCP server view id; knowledge tags must match the seeded node
// attribute for attribute (id, title, space, dsv), since a wrong one breaks the reference.
function checkInlineReferences(
  args: SuggestionItem,
  references: { toolKeys?: string[]; knowledgeKeys?: string[] },
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

  return { success: true };
}

// The `edit_skill` suggestion of the final call on the scenario's skill.
function findSkillEdit(
  finalToolCall: ToolCall,
  scenario: SeededScenario,
  skillKey: string
): FindSuggestionResult {
  return findSuggestion(finalToolCall, "edit_skill", {
    field: "skillId",
    id: resolveSkillId(scenario, skillKey),
    label: `skill "${skillKey}"`,
  });
}

// Requires `field` to be set on the found suggestion.
function requireField(
  found: FindSuggestionResult,
  field: string
): AssertionResult {
  if (!found.success) {
    return found;
  }
  if (found.item[field] === undefined) {
    return {
      success: false,
      error: `The suggestion does not change \`${field}\`: ${JSON.stringify(found.item)}`,
    };
  }
  return { success: true };
}

/**
 * Validates the run's final (last non-exploratory) tool call against the scenario expectation: it
 * must be a `suggest` call carrying the expected change on the expected entity. Skill, agent and
 * member keys are resolved to the ids assigned at seed time.
 */
export function validateFinalToolCall(
  assertion: FinalToolCallAssertion,
  finalToolCall: ToolCall | null,
  scenario: SeededScenario
): AssertionResult {
  if (!finalToolCall) {
    return {
      success: false,
      error: `Expected the run to end with a ${TOOL.suggest} call, but no non-exploratory tool was called`,
    };
  }

  switch (assertion.type) {
    case "suggestAgentCreation":
      return findSuggestion(finalToolCall, "create_agent");

    case "suggestSkillUpdate": {
      const found = findSkillEdit(finalToolCall, scenario, assertion.skillKey);
      if (!found.success) {
        return found;
      }
      const required: SkillUpdateEditKind[] = assertion.edits ?? [];
      const missing = required.filter((kind) => !hasEdit(found.item, kind));
      if (missing.length > 0) {
        return {
          success: false,
          error: `The edit_skill suggestion is missing ${missing.join(", ")}`,
        };
      }
      if (
        required.length === 0 &&
        !hasEdit(found.item, "instructionEdits") &&
        !hasEdit(found.item, "agentFacingDescription")
      ) {
        return {
          success: false,
          error:
            "The edit_skill suggestion carries neither instructionEdits nor agentFacingDescription",
        };
      }
      if (assertion.references) {
        return checkInlineReferences(
          found.item,
          assertion.references,
          scenario
        );
      }
      return { success: true };
    }

    case "suggestSkillEditors": {
      const found = findSkillEdit(finalToolCall, scenario, assertion.skillKey);
      if (!found.success) {
        return found;
      }
      const addUserIds = Array.isArray(found.item.addEditorUserIds)
        ? found.item.addEditorUserIds.filter(isString)
        : [];
      const missing = (assertion.addMemberKeys ?? []).filter(
        (key) => !addUserIds.includes(resolveMemberId(scenario, key))
      );
      if (missing.length > 0) {
        return {
          success: false,
          error: `The edit_skill suggestion does not add member(s) ${missing.join(", ")}; addEditorUserIds=${JSON.stringify(addUserIds)}`,
        };
      }
      return requireField(found, "addEditorUserIds");
    }

    case "suggestSkillDeletion":
      return findSuggestion(finalToolCall, "delete_skill", {
        field: "skillId",
        id: resolveSkillId(scenario, assertion.skillKey),
        label: `skill "${assertion.skillKey}"`,
      });

    case "suggestSkillName":
      return requireField(
        findSkillEdit(finalToolCall, scenario, assertion.skillKey),
        "name"
      );

    case "suggestSkillAvailability": {
      const found = findSkillEdit(finalToolCall, scenario, assertion.skillKey);
      const base = requireField(found, "availability");
      if (!base.success || !found.success) {
        return base;
      }
      if (
        assertion.availability !== undefined &&
        found.item.availability !== assertion.availability
      ) {
        return {
          success: false,
          error: `Expected availability "${assertion.availability}", got "${String(found.item.availability)}"`,
        };
      }
      return { success: true };
    }

    case "suggestSkillUserFacingDescription":
      return requireField(
        findSkillEdit(finalToolCall, scenario, assertion.skillKey),
        "userFacingDescription"
      );

    case "suggestAgentInstructionsChange": {
      const found = findSuggestion(finalToolCall, "edit_agent", {
        field: "agentId",
        id: resolveAgentId(scenario, assertion.agentKey),
        label: `agent "${assertion.agentKey}"`,
      });
      if (!found.success) {
        return found;
      }
      const edits = Array.isArray(found.item.instructionEdits)
        ? found.item.instructionEdits.filter(isInstructionEditItem)
        : [];
      if (edits.length === 0) {
        return {
          success: false,
          error: "The edit_agent suggestion carries no valid instructionEdits",
        };
      }
      // A block outside the expected ones means the change was applied to the wrong section or to
      // the whole instructions.
      const outside = edits
        .map((edit) => edit.targetBlockId)
        .filter(
          (id) =>
            assertion.allowedTargetBlockIds !== undefined &&
            !assertion.allowedTargetBlockIds.includes(id)
        );
      if (outside.length > 0) {
        return {
          success: false,
          error: `Edits target block(s) ${JSON.stringify(outside)}, outside the expected ones: ${JSON.stringify(assertion.allowedTargetBlockIds)}`,
        };
      }
      return { success: true };
    }

    default:
      assertNever(assertion);
  }
}

// `:build_skill[Name]{sId=xxx}` / `:build_agent[Name]{sId=xxx}`, the directives that render the
// entity as a clickable chip. Only the id matters here: the label is what the model wrote.
const BUILD_SKILL_REGEX = /:build_skill\[[^\]]*\]\{[^}]*sId=([^}\s]+)/g;
const BUILD_AGENT_REGEX = /:build_agent\[[^\]]*\]\{[^}]*sId=([^}\s]+)/g;

function mentionedIds(responseText: string, regex: RegExp): string[] {
  return [...responseText.matchAll(regex)].map((m) => m[1]);
}

/**
 * The response must mention the entity it acted on with its mention directive, so the user can
 * click it open next to the suggestion cards. A created agent has no id the model could know, so it
 * is not checked; an edited agent is
 * checked against its seeded id, like a skill.
 */
export function validateEntityMention(
  assertion: FinalToolCallAssertion,
  responseText: string,
  scenario: SeededScenario
): AssertionResult {
  // A created agent has no id the model could know: it is named in plain text.
  if (assertion.type === "suggestAgentCreation") {
    return { success: true };
  }

  if (assertion.type === "suggestAgentInstructionsChange") {
    const expectedAgentId = resolveAgentId(scenario, assertion.agentKey);
    const mentioned = mentionedIds(responseText, BUILD_AGENT_REGEX);
    if (!mentioned.includes(expectedAgentId)) {
      return {
        success: false,
        error:
          `Expected the response to mention agent "${assertion.agentKey}" as ` +
          `:build_agent[...]{sId=${expectedAgentId}}; mentioned ids: ${JSON.stringify(mentioned)}`,
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
