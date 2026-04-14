import { buildReinforcedSkillsLLMParams } from "@app/lib/reinforcement/run_reinforced_analysis";
import { describe, expect, it } from "vitest";

describe("buildReinforcedSkillsLLMParams", () => {
  it("places the system prompt in the prompt field", () => {
    const params = buildReinforcedSkillsLLMParams({
      systemPrompt: "You are a skill analyst.",
      userMessage: "Analyze this skill.",
    });

    expect(params.prompt).toBe("You are a skill analyst.");
  });

  it("places the user message as a single user message in the conversation", () => {
    const params = buildReinforcedSkillsLLMParams({
      systemPrompt: "System.",
      userMessage: "User content here.",
    });

    expect(params.conversation.messages).toHaveLength(1);
    const msg = params.conversation.messages[0];
    expect(msg.role).toBe("user");
    expect(msg.content).toEqual([{ type: "text", text: "User content here." }]);
  });

  it("includes tool specifications for the skill suggestion tools", () => {
    const params = buildReinforcedSkillsLLMParams({
      systemPrompt: "System.",
      userMessage: "User.",
    });

    const toolNames = params.specifications?.map((s) => s.name) ?? [];
    expect(toolNames).toContain("edit_skill");
    expect(toolNames).toContain("get_available_tools");
  });

  it("each specification has a non-empty description and inputSchema", () => {
    const params = buildReinforcedSkillsLLMParams({
      systemPrompt: "System.",
      userMessage: "User.",
    });

    for (const spec of params.specifications ?? []) {
      expect(spec.description).toBeTruthy();
      expect(spec.inputSchema).toBeTruthy();
    }
  });
});
