import { buildReinforcedLLMParams } from "@app/lib/reinforced_agent/run_reinforced_analysis";
import { describe, expect, it } from "vitest";

describe("buildReinforcedLLMParams", () => {
  it("places the system prompt in the prompt field", () => {
    const params = buildReinforcedLLMParams({
      systemPrompt: "You are an analyst.",
      userMessage: "Analyze this.",
    });

    expect(params.prompt).toBe("You are an analyst.");
  });

  it("places the user message as a single user message in the conversation", () => {
    const params = buildReinforcedLLMParams({
      systemPrompt: "System.",
      userMessage: "User content here.",
    });

    expect(params.conversation.messages).toHaveLength(1);
    const msg = params.conversation.messages[0];
    expect(msg.role).toBe("user");
    expect(msg.content).toEqual([{ type: "text", text: "User content here." }]);
  });

  it("includes tool specifications for the three suggestion tools", () => {
    const params = buildReinforcedLLMParams({
      systemPrompt: "System.",
      userMessage: "User.",
    });

    const toolNames = params.specifications?.map((s) => s.name) ?? [];
    expect(toolNames).toContain("suggest_prompt_edits");
    expect(toolNames).toContain("suggest_tools");
    expect(toolNames).toContain("suggest_skills");
  });

  it("each specification has a non-empty description and inputSchema", () => {
    const params = buildReinforcedLLMParams({
      systemPrompt: "System.",
      userMessage: "User.",
    });

    for (const spec of params.specifications ?? []) {
      expect(spec.description).toBeTruthy();
      expect(spec.inputSchema).toBeTruthy();
    }
  });
});
