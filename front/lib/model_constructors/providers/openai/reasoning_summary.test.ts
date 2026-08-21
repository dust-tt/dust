import { openAIReasoningSummaryForModel } from "@app/lib/model_constructors/providers/openai/reasoning_summary";
import { GPT_5_1, GPT_5_2 } from "@app/lib/model_constructors/types/models";
import { describe, expect, it } from "vitest";

describe("openAIReasoningSummaryForModel", () => {
  it("uses concise summaries for supported models when enabled", () => {
    expect(openAIReasoningSummaryForModel(GPT_5_2, true)).toBe("concise");
  });

  it("retains automatic summaries when disabled or unsupported", () => {
    expect(openAIReasoningSummaryForModel(GPT_5_2, false)).toBe("auto");
    expect(openAIReasoningSummaryForModel(GPT_5_1, true)).toBe("auto");
  });
});
