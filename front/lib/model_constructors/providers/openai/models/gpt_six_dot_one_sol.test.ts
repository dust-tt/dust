import { DustOpenAIGptSixDotOneSolEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_dot_one_sol_eu_openai_responses";
import { DustOpenAIGptSixDotOneSolGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_dot_one_sol_global_openai_responses";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { GPT_6_SOL_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

function parseThroughDustConfigParsers(
  endpoint: typeof DustOpenAIGptSixDotOneSolGlobalOpenAIResponsesStream,
  config: InputConfig
) {
  return endpoint.configSchema.safeParse(
    endpoint.configParsers.reduce<InputConfig>(
      (acc, parser) => parser(acc),
      config
    )
  );
}

describe("GPT 6.1 Sol", () => {
  it("exposes GPT-6 Sol's context and input budget on both Dust endpoints", () => {
    for (const endpoint of [
      DustOpenAIGptSixDotOneSolGlobalOpenAIResponsesStream,
      DustOpenAIGptSixDotOneSolEuropeOpenAIResponsesStream,
    ]) {
      expect(endpoint.contextSize).toBe(GPT_6_SOL_MODEL_CONFIG.contextSize);
      expect(endpoint.maxOutputTokens).toBe(
        GPT_6_SOL_MODEL_CONFIG.generationTokensCount
      );
    }
  });

  it("pins temperature to 1 and serializes the supported reasoning effort", () => {
    const endpoint = DustOpenAIGptSixDotOneSolGlobalOpenAIResponsesStream;
    const instance = new endpoint({ OPENAI_API_KEY: "test" });
    const parsed = parseThroughDustConfigParsers(endpoint, {
      temperature: 0.7,
      reasoning: { effort: "maximal" },
      conciseReasoningSummary: true,
    });
    expect(parsed.success).toBe(true);
    const request = instance.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      parsed.data ?? {}
    );

    expect(request.model).toBe("gpt-6.1-sol");
    expect(request.reasoning).toEqual({ effort: "max", summary: "concise" });
    expect(request.temperature).toBe(1);
  });

  it("rejects the none effort", () => {
    const parsed = parseThroughDustConfigParsers(
      DustOpenAIGptSixDotOneSolGlobalOpenAIResponsesStream,
      { reasoning: { effort: "none" } }
    );

    expect(parsed.success).toBe(false);
  });
});
