import { buildSkillAnalysisPrompt } from "@app/lib/reinforced_skills/analyze_conversation";
import type { SkillType } from "@app/types/assistant/skill_configuration";
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

describe("buildSkillAnalysisPrompt", () => {
  it("includes skill name and sId in user message", () => {
    const skill = makeSkill({ name: "DataLookup", sId: "skl_data" });
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [skill]);

    expect(userMessage).toContain("Skill: DataLookup (ID: skl_data)");
  });

  it("includes description when present", () => {
    const skill = makeSkill({
      agentFacingDescription: "Searches internal databases",
    });
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [skill]);

    expect(userMessage).toContain("Description: Searches internal databases");
  });

  it("omits description section when empty", () => {
    const skill = makeSkill({ agentFacingDescription: "" });
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [skill]);

    expect(userMessage).not.toContain("Description:");
  });

  it("includes instructions when present", () => {
    const skill = makeSkill({
      instructions: "Always verify data before responding.",
    });
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [skill]);

    expect(userMessage).toContain("### Current instructions");
    expect(userMessage).toContain(
      "Always verify data before responding."
    );
  });

  it("omits instructions section when null", () => {
    const skill = makeSkill({ instructions: null });
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [skill]);

    expect(userMessage).not.toContain("### Current instructions");
  });

  it("wraps conversation text in <conversation> tags", () => {
    const conversationText = "User: What is Dust?\nAgent: Dust is a platform.";
    const { userMessage } = buildSkillAnalysisPrompt(conversationText, [
      makeSkill(),
    ]);

    expect(userMessage).toContain("<conversation>");
    expect(userMessage).toContain(conversationText);
    expect(userMessage).toContain("</conversation>");
  });

  it("wraps skills in <skill_context> tags", () => {
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [
      makeSkill(),
    ]);

    expect(userMessage).toContain("<skill_context>");
    expect(userMessage).toContain("</skill_context>");
  });

  it("system prompt mentions suggestion and exploration tools", () => {
    const { systemPrompt } = buildSkillAnalysisPrompt("User: hello", [
      makeSkill(),
    ]);

    expect(systemPrompt).toContain("suggest_skill_instruction_edits");
    expect(systemPrompt).toContain("suggest_skill_tools");
    expect(systemPrompt).toContain("get_available_tools");
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
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [skill]);

    expect(userMessage).toContain("### Configured tools");
    expect(userMessage).toContain("web_search (ID: tool-ws)");
  });

  it("includes multiple skills in user message", () => {
    const skill1 = makeSkill({ name: "SkillA", sId: "skl_a" });
    const skill2 = makeSkill({ name: "SkillB", sId: "skl_b" });
    const { userMessage } = buildSkillAnalysisPrompt("User: hello", [
      skill1,
      skill2,
    ]);

    expect(userMessage).toContain("Skill: SkillA (ID: skl_a)");
    expect(userMessage).toContain("Skill: SkillB (ID: skl_b)");
  });
});
