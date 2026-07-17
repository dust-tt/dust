import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { OpenAIResponsesEuropeGptFiveDotSixLunaStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_luna";
import { OpenAIResponsesEuropeGptFiveDotSixSolStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_sol";
import { OpenAIResponsesEuropeGptFiveDotSixTerraStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_terra";
import { OpenAIResponsesGlobalGptFiveDotSixLunaStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_luna";
import { OpenAIResponsesGlobalGptFiveDotSixSolStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_sol";
import { OpenAIResponsesGlobalGptFiveDotSixTerraStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_terra";
import {
  GPT_5_6_LUNA_MODEL_CONFIG,
  GPT_5_6_SOL_MODEL_CONFIG,
  GPT_5_6_TERRA_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

const EXPECTED_CONTEXT_SIZE = 272_000;
const EXPECTED_MAX_OUTPUT_TOKENS = 128_000;

const GPT_5_6_CONFIGURATIONS = [
  {
    name: "Sol",
    legacy: GPT_5_6_SOL_MODEL_CONFIG,
    endpoints: [
      OpenAIResponsesGlobalGptFiveDotSixSolStream,
      OpenAIResponsesEuropeGptFiveDotSixSolStream,
    ],
  },
  {
    name: "Terra",
    legacy: GPT_5_6_TERRA_MODEL_CONFIG,
    endpoints: [
      OpenAIResponsesGlobalGptFiveDotSixTerraStream,
      OpenAIResponsesEuropeGptFiveDotSixTerraStream,
    ],
  },
  {
    name: "Luna",
    legacy: GPT_5_6_LUNA_MODEL_CONFIG,
    endpoints: [
      OpenAIResponsesGlobalGptFiveDotSixLunaStream,
      OpenAIResponsesEuropeGptFiveDotSixLunaStream,
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
    expect(getModelConfigByModelId(legacy.modelId)?.contextSize).toBe(
      EXPECTED_CONTEXT_SIZE
    );

    for (const endpoint of endpoints) {
      expect(endpoint.contextSize).toBe(EXPECTED_CONTEXT_SIZE);
      expect(endpoint.maxOutputTokens).toBe(EXPECTED_MAX_OUTPUT_TOKENS);
    }
  });
});
