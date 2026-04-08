import { buildSkillAggregationPrompt } from "@app/lib/reinforcement/aggregate_suggestions";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { describe, expect, it } from "vitest";

function makeSkill(overrides: Partial<SkillType> = {}): SkillType {
  return {
    id: 1,
    sId: "skl_abc123",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    editedBy: null,
    status: "active",
    name: "TestSkill",
    agentFacingDescription: "A test skill",
    userFacingDescription: "A test skill for users",
    instructions: null,
    icon: null,
    source: null,
    sourceMetadata: null,
    requestedSpaceIds: [],
    tools: [],
    fileAttachments: [],
    canWrite: true,
    isExtendable: false,
    isDefault: false,
    extendedSkillId: null,
    ...overrides,
  };
}

function makeInstructionSuggestion(
  overrides: Partial<SkillSuggestionType> = {}
): SkillSuggestionType {
  return {
    sId: "sug-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skillConfigurationId: "skl_abc123",
    analysis: "Instructions could be more specific",
    state: "pending",
    source: "synthetic",
    sourceConversationId: null,
    kind: "edit_instructions",
    suggestion: {
      instructions: "Always verify data before responding.",
    },
    ...overrides,
  } as SkillSuggestionType;
}

function makeToolSuggestion(
  overrides: Partial<SkillSuggestionType> = {}
): SkillSuggestionType {
  return {
    sId: "sug-2",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    skillConfigurationId: "skl_abc123",
    analysis: "Needs search capability",
    state: "pending",
    source: "synthetic",
    sourceConversationId: null,
    kind: "tools",
    suggestion: {
      action: "add",
      toolId: "tool-search",
    },
    ...overrides,
  } as SkillSuggestionType;
}

describe("buildSkillAggregationPrompt", () => {
  it("includes the skill name in the user message", () => {
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill({ name: "DataLookup" }),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] }
    );

    expect(userMessage).toContain("Skill: DataLookup");
  });

  it("formats instruction suggestions with skillId and instructions", () => {
    const suggestion = makeInstructionSuggestion({
      skillConfigurationId: "skl_target",
      suggestion: {
        instructions: "New improved instructions.",
      },
    } as Partial<SkillSuggestionType>);
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [suggestion],
      { pending: [], rejected: [] }
    );

    expect(userMessage).toContain("kind: edit_instructions");
    expect(userMessage).toContain("skillId: skl_target");
    expect(userMessage).toContain("instructions: New improved instructions.");
  });

  it("formats tool suggestions with action and toolId", () => {
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [makeToolSuggestion()],
      { pending: [], rejected: [] }
    );

    expect(userMessage).toContain("kind: tools");
    expect(userMessage).toContain("action: add");
    expect(userMessage).toContain("toolId: tool-search");
  });

  it("shows N/A when analysis is null", () => {
    const suggestion = makeInstructionSuggestion({ analysis: null });
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [suggestion],
      { pending: [], rejected: [] }
    );

    expect(userMessage).toContain("analysis: N/A");
  });

  it("numbers multiple suggestions sequentially", () => {
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [makeInstructionSuggestion(), makeToolSuggestion()],
      { pending: [], rejected: [] }
    );

    expect(userMessage).toContain("### Suggestion 1");
    expect(userMessage).toContain("### Suggestion 2");
  });

  it("includes pending suggestions section when non-empty", () => {
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [makeInstructionSuggestion()],
      { pending: [makeToolSuggestion()], rejected: [] }
    );

    expect(userMessage).toContain(
      "## Existing pending suggestions (do NOT duplicate these)"
    );
  });

  it("omits pending suggestions section when empty", () => {
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] }
    );

    expect(userMessage).not.toContain("Existing pending suggestions");
  });

  it("includes rejected suggestions section when non-empty", () => {
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [makeToolSuggestion()] }
    );

    expect(userMessage).toContain(
      "## Previously rejected suggestions (do NOT recreate similar ones)"
    );
  });

  it("omits rejected suggestions section when empty", () => {
    const { userMessage } = buildSkillAggregationPrompt(
      makeSkill(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] }
    );

    expect(userMessage).not.toContain("Previously rejected suggestions");
  });

  it("system prompt mentions the suggestion tools", () => {
    const { systemPrompt } = buildSkillAggregationPrompt(
      makeSkill(),
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] }
    );

    expect(systemPrompt).toContain("suggest_skill_instruction_edits");
    expect(systemPrompt).toContain("suggest_skill_tools");
  });

  it("includes skill configured tools in user message", () => {
    const skill = makeSkill({
      tools: [
        {
          sId: "tool-ws",
          name: "web_search",
        } as SkillType["tools"][number],
      ],
    });
    const { userMessage } = buildSkillAggregationPrompt(
      skill,
      [makeInstructionSuggestion()],
      { pending: [], rejected: [] }
    );

    expect(userMessage).toContain("### Configured tools");
    expect(userMessage).toContain("web_search (ID: tool-ws)");
  });
});
