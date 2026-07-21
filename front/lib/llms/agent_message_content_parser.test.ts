import { getDelimitersConfiguration } from "@app/lib/llms/agent_message_content_parser";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { DEEPSEEK_CHAT_MODEL_ID } from "@app/types/assistant/models/deepseek";
import { describe, expect, it } from "vitest";

function makeModel(
  model: Partial<AgentModelConfigurationType>
): AgentModelConfigurationType {
  return {
    providerId: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    temperature: 0,
    ...model,
  };
}

describe("getDelimitersConfiguration", () => {
  it("does not parse legacy chain-of-thought delimiters for light reasoning", () => {
    expect(
      getDelimitersConfiguration({
        model: makeModel({ reasoningEffort: "light" }),
      })
    ).toEqual({
      delimiters: [],
      incompleteDelimiterPatterns: [],
    });
  });

  it("keeps parsing DeepSeek native reasoning delimiters", () => {
    expect(
      getDelimitersConfiguration({
        model: makeModel({
          providerId: "deepseek",
          modelId: DEEPSEEK_CHAT_MODEL_ID,
        }),
      }).delimiters
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          openingPattern: "<think>",
          classification: "chain_of_thought",
        }),
      ])
    );
  });
});
