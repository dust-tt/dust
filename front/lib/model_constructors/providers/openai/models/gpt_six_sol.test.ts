import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { DustOpenAIGptSixSolEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_sol_eu_openai_responses";
import { DustOpenAIGptSixSolGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_sol_global_openai_responses";
import { OpenAIGptSixSolGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_sol_global_openai_responses";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import {
  GPT_5_6_SOL_MODEL_CONFIG,
  GPT_6_SOL_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

function parseThroughDustConfigParsers(
  endpoint: typeof DustOpenAIGptSixSolGlobalOpenAIResponsesStream,
  config: InputConfig
) {
  return endpoint.configSchema.parse(
    endpoint.configParsers.reduce<InputConfig>(
      (acc, parser) => parser(acc),
      config
    )
  );
}

describe("GPT 6 Sol", () => {
  it("exposes GPT-5.6's context and input budget on both Dust endpoints", () => {
    const reference = GPT_5_6_SOL_MODEL_CONFIG;
    for (const endpoint of [
      DustOpenAIGptSixSolGlobalOpenAIResponsesStream,
      DustOpenAIGptSixSolEuropeOpenAIResponsesStream,
    ]) {
      expect(endpoint.contextSize).toBe(reference.contextSize);
      expect(endpoint.maxOutputTokens).toBe(reference.generationTokensCount);
      expect(endpoint.contextSize - endpoint.maxOutputTokens).toBe(208_000);
    }
    expect(
      getModelConfigByModelId(GPT_6_SOL_MODEL_CONFIG.modelId)?.contextSize
    ).toBe(reference.contextSize);
    expect(GPT_6_SOL_MODEL_CONFIG.generationTokensCount).toBe(
      reference.generationTokensCount
    );
    expect(OpenAIGptSixSolGlobalOpenAIResponsesStream.contextSize).toBe(
      1_050_000
    );
    expect(OpenAIGptSixSolGlobalOpenAIResponsesStream.maxOutputTokens).toBe(
      128_000
    );
  });

  it("pins temperature to 1 and serializes the supported reasoning effort while reasoning", () => {
    const endpoint = DustOpenAIGptSixSolGlobalOpenAIResponsesStream;
    const instance = new endpoint({ OPENAI_API_KEY: "test" });
    const config = parseThroughDustConfigParsers(endpoint, {
      temperature: 0.7,
      reasoning: { effort: "maximal" },
      conciseReasoningSummary: true,
    });
    const request = instance.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      config
    );

    expect(request.model).toBe("gpt-6-sol");
    expect(request.reasoning).toEqual({ effort: "max", summary: "concise" });
    // `dropTemperatureWhenReasoning` strips Dust's 0.7, and the schema defaults
    // it back to the only value the Responses API takes alongside reasoning.
    expect(request.temperature).toBe(1);
    expect(request.max_output_tokens).toBe(64_000);
  });

  it("keeps Dust's temperature when reasoning is off", () => {
    const endpoint = DustOpenAIGptSixSolGlobalOpenAIResponsesStream;
    const instance = new endpoint({ OPENAI_API_KEY: "test" });
    const config = parseThroughDustConfigParsers(endpoint, {
      temperature: 0.7,
      reasoning: { effort: "none" },
    });
    const request = instance.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      config
    );

    expect(request.temperature).toBe(0.7);
  });
});
