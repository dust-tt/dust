import { extractKnowledgeTagReferences } from "@app/lib/knowledge/format";
import { extractSkillRefs } from "@app/lib/skills/format";
import { extractToolTags } from "@app/lib/tools/format";
import { TOOL } from "@app/tests/conversational-building-evals/lib/tool-runner";
import type {
  ExecutedToolCall,
  ExecutionResult,
  ExpectedSuggestion,
  FinalToolCallAssertion,
  SeededScenario,
  SkillUpdateEditKind,
  ToolCall,
} from "@app/tests/conversational-building-evals/lib/types";
import { ResponseFormatSchema } from "@app/types/assistant/models/types";
import { validateResponseFormat } from "@app/types/assistant/models/utils";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { BUILD_ENTITY_REGEX } from "@app/types/shared/utils/markdown";
import type { SkillInstructionEditItemType } from "@app/types/suggestions/skill_suggestion";
import { SkillInstructionEditItemSchema } from "@app/types/suggestions/skill_suggestion";
import isEqual from "lodash/isEqual";

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

function getSuggestions(suggestCall: ToolCall): SuggestionItem[] {
  return Array.isArray(suggestCall.arguments.suggestions)
    ? suggestCall.arguments.suggestions.filter(isSuggestionItem)
    : [];
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
  const suggestions = getSuggestions(finalToolCall);
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

function describeExpectedSuggestion(expected: ExpectedSuggestion): string {
  switch (expected.kind) {
    case "edit_skill":
      return `edit_skill on skill "${expected.skillKey}"`;
    case "edit_agent":
      return `edit_agent on agent "${expected.agentKey}"`;
    default:
      assertNever(expected);
  }
}

function matchesExpectedSuggestion(
  item: SuggestionItem,
  expected: ExpectedSuggestion,
  scenario: SeededScenario
): boolean {
  switch (expected.kind) {
    case "edit_skill":
      return (
        item.kind === "edit_skill" &&
        item.skillId === resolveSkillId(scenario, expected.skillKey)
      );
    case "edit_agent":
      return (
        item.kind === "edit_agent" &&
        item.agentId === resolveAgentId(scenario, expected.agentKey)
      );
    default:
      assertNever(expected);
  }
}

// Independent changes must be recorded as separate suggestions: every `suggest` call that went
// through carries a single suggestion, and together they record exactly the expected ones, in any
// round. Rejected calls recorded nothing, so a retry after one is fine.
function validateSeparateSuggestions(
  expectedSuggestions: ExpectedSuggestion[],
  toolCalls: ExecutedToolCall[],
  scenario: SeededScenario
): AssertionResult {
  const recordedCalls = toolCalls.filter(
    (tc) => tc.name === TOOL.suggest && !tc.isError
  );

  const unmatched = [...expectedSuggestions];
  for (const suggestCall of recordedCalls) {
    const suggestions = getSuggestions(suggestCall);
    if (suggestions.length !== 1) {
      return {
        success: false,
        error: `Each ${TOOL.suggest} call must carry a single suggestion; got ${JSON.stringify(suggestions)}`,
      };
    }
    const [item] = suggestions;
    const index = unmatched.findIndex((expected) =>
      matchesExpectedSuggestion(item, expected, scenario)
    );
    if (index === -1) {
      return {
        success: false,
        error: `Unexpected or duplicate suggestion: ${JSON.stringify(item)}`,
      };
    }
    const [expected] = unmatched.splice(index, 1);
    const wrongFields = Object.entries(expected.fields).filter(
      ([field, value]) => !isEqual(item[field], value)
    );
    if (wrongFields.length > 0) {
      return {
        success: false,
        error:
          `The ${describeExpectedSuggestion(expected)} suggestion must carry ` +
          `${JSON.stringify(Object.fromEntries(wrongFields))}; got ${JSON.stringify(item)}`,
      };
    }
  }

  if (unmatched.length > 0) {
    return {
      success: false,
      error: `Missing suggestion(s): ${unmatched.map(describeExpectedSuggestion).join(", ")}`,
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
  {
    finalToolCall,
    toolCalls,
  }: Pick<ExecutionResult, "finalToolCall" | "toolCalls">,
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

    case "suggestSubAgentByRef": {
      const created = findSuggestion(finalToolCall, "create_agent");
      if (!created.success) {
        return created;
      }
      const { ref } = created.item;
      if (!isString(ref)) {
        return {
          success: false,
          error: `The create_agent suggestion declares no ref: ${JSON.stringify(created.item)}`,
        };
      }

      const parent = findSuggestion(finalToolCall, "edit_agent", {
        field: "agentId",
        id: resolveAgentId(scenario, assertion.parentAgentKey),
        label: `agent "${assertion.parentAgentKey}"`,
      });
      if (!parent.success) {
        return parent;
      }
      const { subAgents } = parent.item;
      const addAgentRefs =
        isSuggestionItem(subAgents) && Array.isArray(subAgents.addAgentRefs)
          ? subAgents.addAgentRefs
          : [];
      if (!addAgentRefs.includes(ref)) {
        return {
          success: false,
          error: `The edit_agent suggestion does not add the created agent (ref "${ref}") as a sub-agent: ${JSON.stringify(parent.item)}`,
        };
      }
      return { success: true };
    }

    case "suggestAgentSkillByRef": {
      const created = findSuggestion(finalToolCall, "create_skill");
      if (!created.success) {
        return created;
      }
      const { ref } = created.item;
      if (!isString(ref)) {
        return {
          success: false,
          error: `The create_skill suggestion declares no ref: ${JSON.stringify(created.item)}`,
        };
      }

      if (!assertion.agentKey) {
        const agent = findSuggestion(finalToolCall, "create_agent");
        if (!agent.success) {
          return agent;
        }
        const { skillRefs } = agent.item;
        if (!Array.isArray(skillRefs) || !skillRefs.includes(ref)) {
          return {
            success: false,
            error: `The create_agent suggestion does not give the created skill (ref "${ref}") to the agent: ${JSON.stringify(agent.item)}`,
          };
        }
        return { success: true };
      }

      const agent = findSuggestion(finalToolCall, "edit_agent", {
        field: "agentId",
        id: resolveAgentId(scenario, assertion.agentKey),
        label: `agent "${assertion.agentKey}"`,
      });
      if (!agent.success) {
        return agent;
      }
      const { skills } = agent.item;
      const addSkillRefs =
        isSuggestionItem(skills) && Array.isArray(skills.addSkillRefs)
          ? skills.addSkillRefs
          : [];
      if (!addSkillRefs.includes(ref)) {
        return {
          success: false,
          error: `The edit_agent suggestion does not add the created skill (ref "${ref}") to the agent: ${JSON.stringify(agent.item)}`,
        };
      }
      return { success: true };
    }

    case "suggestSkillCitingNewSkill": {
      const created = findSuggestion(finalToolCall, "create_skill");
      if (!created.success) {
        return created;
      }
      const creations = getSuggestions(finalToolCall).filter(
        (s) => s.kind === "create_skill"
      );
      const declaredRefs = creations.map((s) => s.ref).filter(isString);

      if (!assertion.skillKey) {
        const citesAnotherCreation = creations.some(
          (creation) =>
            isString(creation.instructions) &&
            extractSkillRefs(creation.instructions).some(
              (ref) => ref !== creation.ref && declaredRefs.includes(ref)
            )
        );
        if (!citesAnotherCreation) {
          return {
            success: false,
            error: `No create_skill suggestion cites another created skill as <skill ref="..."/>: ${JSON.stringify(creations)}`,
          };
        }
        return { success: true };
      }

      const edit = findSkillEdit(finalToolCall, scenario, assertion.skillKey);
      if (!edit.success) {
        return edit;
      }
      const citedRefs = extractSkillRefs(getInstructionEditsContent(edit.item));
      if (!citedRefs.some((ref) => declaredRefs.includes(ref))) {
        return {
          success: false,
          error: `The edit_skill instruction edits cite no created skill (declared refs ${JSON.stringify(declaredRefs)}, cited ${JSON.stringify(citedRefs)})`,
        };
      }
      return { success: true };
    }

    case "suggestSkillCreation":
      return findSuggestion(finalToolCall, "create_skill");

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

    case "separateSuggestions":
      return validateSeparateSuggestions(
        assertion.suggestions,
        toolCalls,
        scenario
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

    case "suggestAgentModelChange": {
      const found = findSuggestion(finalToolCall, "edit_agent", {
        field: "agentId",
        id: resolveAgentId(scenario, assertion.agentKey),
        label: `agent "${assertion.agentKey}"`,
      });
      if (!found.success) {
        return found;
      }
      if (found.item.modelId !== assertion.modelId) {
        return {
          success: false,
          error: `Expected modelId "${assertion.modelId}", got ${JSON.stringify(found.item.modelId)}`,
        };
      }
      return { success: true };
    }

    case "suggestAgentStructuredOutput": {
      const found = findSuggestion(finalToolCall, "edit_agent", {
        field: "agentId",
        id: resolveAgentId(scenario, assertion.agentKey),
        label: `agent "${assertion.agentKey}"`,
      });
      if (!found.success) {
        return found;
      }
      const { structuredOutput } = found.item;
      if (!isString(structuredOutput)) {
        return {
          success: false,
          error: `Expected a structuredOutput JSON string, got ${JSON.stringify(structuredOutput)}`,
        };
      }
      const validation = validateResponseFormat(structuredOutput);
      if (!validation.isValid) {
        return { success: false, error: validation.errorMessage };
      }
      const { required } = ResponseFormatSchema.parse(
        JSON.parse(structuredOutput)
      ).json_schema.schema;
      const missing = assertion.requiredProperties.filter(
        (pattern) => !required.some((name) => pattern.test(name))
      );
      if (missing.length > 0) {
        return {
          success: false,
          error: `No required property matches ${missing.join(", ")}; required: ${JSON.stringify(required)}`,
        };
      }
      return { success: true };
    }

    default:
      assertNever(assertion);
  }
}

interface BuildEntityMention {
  kind: "skill" | "agent";
  sId: string;
}

const SID_ATTRIBUTE_REGEX = /(?:^|\s)sId=([^\s}]+)/;

// The `:build_skill` / `:build_agent` directives of the response, the ones that render the entity
// as a clickable chip. Only the id matters here: the label is what the model wrote.
function extractBuildEntityMentions(text: string): BuildEntityMention[] {
  return [...text.matchAll(BUILD_ENTITY_REGEX)].flatMap(
    ([, kind, , attributes]) => {
      const sId = SID_ATTRIBUTE_REGEX.exec(attributes)?.[1];
      if (!sId) {
        return [];
      }
      return [{ kind: kind === "skill" ? "skill" : "agent", sId }];
    }
  );
}

type MentionedEntity = { kind: BuildEntityMention["kind"]; key: string };

// The entities the response must mention, or none for a creation.
function getEntitiesToMention(
  assertion: FinalToolCallAssertion
): MentionedEntity[] {
  switch (assertion.type) {
    // A created agent has no id the model could know: it is named in plain text.
    case "suggestAgentCreation":
    case "suggestSkillCreation":
      return [];
    case "suggestSubAgentByRef":
      return [{ kind: "agent", key: assertion.parentAgentKey }];
    case "suggestAgentSkillByRef":
      return assertion.agentKey
        ? [{ kind: "agent", key: assertion.agentKey }]
        : [];
    case "suggestSkillCitingNewSkill":
      return assertion.skillKey
        ? [{ kind: "skill", key: assertion.skillKey }]
        : [];
    case "suggestAgentInstructionsChange":
    case "suggestAgentModelChange":
    case "suggestAgentStructuredOutput":
      return [{ kind: "agent", key: assertion.agentKey }];
    case "separateSuggestions":
      return assertion.suggestions.map((expected) => {
        switch (expected.kind) {
          case "edit_skill":
            return { kind: "skill", key: expected.skillKey };
          case "edit_agent":
            return { kind: "agent", key: expected.agentKey };
          default:
            assertNever(expected);
        }
      });
    case "suggestSkillUpdate":
    case "suggestSkillEditors":
    case "suggestSkillDeletion":
    case "suggestSkillName":
    case "suggestSkillAvailability":
    case "suggestSkillUserFacingDescription":
      return [{ kind: "skill", key: assertion.skillKey }];
    default:
      assertNever(assertion);
  }
}

/**
 * The response must mention every entity it acted on with its mention directive, so the user can
 * click it open next to the suggestion cards. A created agent has no id the model could know, so it
 * is not checked; an edited agent is checked against its seeded id, like a skill.
 */
export function validateEntityMention(
  assertion: FinalToolCallAssertion,
  responseText: string,
  scenario: SeededScenario
): AssertionResult {
  const mentions = extractBuildEntityMentions(responseText);
  for (const { kind, key } of getEntitiesToMention(assertion)) {
    const expectedId =
      kind === "skill"
        ? resolveSkillId(scenario, key)
        : resolveAgentId(scenario, key);
    if (!mentions.some((m) => m.kind === kind && m.sId === expectedId)) {
      return {
        success: false,
        error:
          `Expected the response to mention ${kind} "${key}" as ` +
          `:build_${kind}[...]{sId=${expectedId}}; mentions: ${JSON.stringify(mentions)}`,
      };
    }
  }
  return { success: true };
}
