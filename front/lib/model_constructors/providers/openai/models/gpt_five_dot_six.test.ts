import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_eu_openai_responses";
import { OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses";
import { OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_eu_openai_responses";
import { OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses";
import {
  GPT_5_6_LUNA_MODEL_CONFIG,
  GPT_5_6_SOL_MODEL_CONFIG,
  GPT_5_6_TERRA_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

const EXPECTED_CONTEXT_SIZE = 272_000;
const EXPECTED_MAX_OUTPUT_TOKENS = 64_000;
const EXPECTED_MAX_INPUT_TOKENS = 208_000;

const GPT_5_6_CONFIGURATIONS = [
  {
    name: "Sol",
    legacy: GPT_5_6_SOL_MODEL_CONFIG,
    endpoints: [
      OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream,
      OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream,
    ],
  },
  {
    name: "Terra",
    legacy: GPT_5_6_TERRA_MODEL_CONFIG,
    endpoints: [
      OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream,
      OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream,
    ],
  },
  {
    name: "Luna",
    legacy: GPT_5_6_LUNA_MODEL_CONFIG,
    endpoints: [
      OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream,
      OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream,
    ],
  },
] as const;

describe("GPT 5.6 model configurations", () => {
  it.each(
    GPT_5_6_CONFIGURATIONS
  )("caps $name context consistently without changing output limits", ({
    legacy,
    endpoints,
  }) => {
    expect(legacy.contextSize).toBe(EXPECTED_CONTEXT_SIZE);
    expect(legacy.generationTokensCount).toBe(EXPECTED_MAX_OUTPUT_TOKENS);
    expect(legacy.contextSize - legacy.generationTokensCount).toBe(
      EXPECTED_MAX_INPUT_TOKENS
    );
    expect(getModelConfigByModelId(legacy.modelId)?.contextSize).toBe(
      EXPECTED_CONTEXT_SIZE
    );

    for (const endpoint of endpoints) {
      expect(endpoint.contextSize).toBe(EXPECTED_CONTEXT_SIZE);
      expect(endpoint.maxOutputTokens).toBe(EXPECTED_MAX_OUTPUT_TOKENS);
    }
  });
});
