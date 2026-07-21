import {
  overwriteLLMParameters,
  type XaiWhitelistedModelId,
} from "@app/lib/api/llm/clients/xai/types";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import {
  GROK_4_5_MODEL_ID,
  GROK_4_MODEL_ID,
} from "@app/types/assistant/models/xai";
import { describe, expect, it } from "vitest";

function makeParameters(
  modelId: XaiWhitelistedModelId,
  reasoningEffort?: LLMParameters["reasoningEffort"]
): LLMParameters & { modelId: XaiWhitelistedModelId } {
  return {
    credentials: { XAI_API_KEY: "test" },
    modelId,
    reasoningEffort,
  };
}

describe("overwriteLLMParameters", () => {
  it("defaults Grok 4.5 to high reasoning", () => {
    expect(
      overwriteLLMParameters(makeParameters(GROK_4_5_MODEL_ID)).reasoningEffort
    ).toBe("high");
  });

  it("preserves an explicit Grok 4.5 reasoning effort", () => {
    expect(
      overwriteLLMParameters(makeParameters(GROK_4_5_MODEL_ID, "light"))
        .reasoningEffort
    ).toBe("light");
  });

  it("preserves the legacy Grok default", () => {
    expect(
      overwriteLLMParameters(makeParameters(GROK_4_MODEL_ID)).reasoningEffort
    ).toBeUndefined();
  });
});
