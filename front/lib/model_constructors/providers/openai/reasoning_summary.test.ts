import { openAIReasoningSummaryForModel } from "@app/lib/model_constructors/providers/openai/reasoning_summary";
import { GPT_5, GPT_5_6_SOL } from "@app/lib/model_constructors/types/models";
import { describe, expect, it } from "vitest";

describe("openAIReasoningSummaryForModel", () => {
  it("uses concise summaries for OpenAI models after GPT-5", () => {
    expect(openAIReasoningSummaryForModel(GPT_5_6_SOL)).toBe("concise");
  });

  it("retains automatic summaries for GPT-5", () => {
    expect(openAIReasoningSummaryForModel(GPT_5)).toBe("auto");
  });
});
