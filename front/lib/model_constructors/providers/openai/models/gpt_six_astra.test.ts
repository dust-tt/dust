import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { DustOpenAIGptSixAstraEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_astra_eu_openai_responses";
import { DustOpenAIGptSixAstraGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_astra_global_openai_responses";
import { OpenAIGptSixAstraGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_astra_global_openai_responses";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import {
  GPT_5_6_SOL_MODEL_CONFIG,
  GPT_6_ASTRA_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

describe("GPT 6 Astra", () => {
  it("exposes GPT-5.6's context and input budget on both Dust endpoints", () => {
    const reference = GPT_5_6_SOL_MODEL_CONFIG;
    for (const endpoint of [
      DustOpenAIGptSixAstraGlobalOpenAIResponsesStream,
      DustOpenAIGptSixAstraEuropeOpenAIResponsesStream,
    ]) {
      expect(endpoint.contextSize).toBe(reference.contextSize);
      expect(endpoint.maxOutputTokens).toBe(reference.generationTokensCount);
      expect(endpoint.contextSize - endpoint.maxOutputTokens).toBe(208_000);
    }
    expect(
      getModelConfigByModelId(GPT_6_ASTRA_MODEL_CONFIG.modelId)?.contextSize
    ).toBe(reference.contextSize);
    expect(GPT_6_ASTRA_MODEL_CONFIG.generationTokensCount).toBe(
      reference.generationTokensCount
    );
    expect(OpenAIGptSixAstraGlobalOpenAIResponsesStream.contextSize).toBe(
      1_050_000
    );
    expect(OpenAIGptSixAstraGlobalOpenAIResponsesStream.maxOutputTokens).toBe(
      128_000
    );
  });

  it("drops Dust's temperature and serializes the supported reasoning effort", () => {
    const endpoint = DustOpenAIGptSixAstraGlobalOpenAIResponsesStream;
    const instance = new endpoint({ OPENAI_API_KEY: "test" });
    const config = endpoint.configSchema.parse(
      endpoint.configParsers.reduce<InputConfig>(
        (config, parser) => parser(config),
        {
          temperature: 0.7,
          reasoning: { effort: "maximal" },
          conciseReasoningSummary: true,
        }
      )
    );
    const request = instance.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      config
    );
    expect(request.model).toBe("gpt-6-astra");
    expect(request.reasoning).toEqual({ effort: "max", summary: "concise" });
    expect(request.temperature).toBeUndefined();
    expect(request.max_output_tokens).toBe(64_000);
  });
});
