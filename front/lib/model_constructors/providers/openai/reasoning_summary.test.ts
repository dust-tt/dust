import { openAIReasoningSummaryForModel } from "@app/lib/model_constructors/providers/openai/reasoning_summary";
import { GPT_5_1, GPT_5_2 } from "@app/lib/model_constructors/types/models";
import { describe, expect, it } from "vitest";

describe("openAIReasoningSummaryForModel", () => {
  it("uses concise summaries starting with GPT-5.2", () => {
    expect(openAIReasoningSummaryForModel(GPT_5_2)).toBe("concise");
  });

  it("retains automatic summaries for GPT-5.1", () => {
    expect(openAIReasoningSummaryForModel(GPT_5_1)).toBe("auto");
  });
});
