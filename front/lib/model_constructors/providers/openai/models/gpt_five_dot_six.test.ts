import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_global_openai_responses";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_eu_openai_responses";
import { OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses";
import { OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_eu_openai_responses";
import { OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses";
import { OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_eu_openai_responses";
import { OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_global_openai_responses";
import { GPT_5_6_TERRA_LONG_CONTEXT } from "@app/lib/model_constructors/types/models";
import {
  GPT_5_6_LUNA_MODEL_CONFIG,
  GPT_5_6_SOL_MODEL_CONFIG,
  GPT_5_6_SOL_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_CONFIG,
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
  it("keeps Sol pricing synchronized across billing and endpoints", () => {
    expect(MODEL_PRICING[GPT_5_6_SOL_MODEL_ID]).toEqual({
      input: 4.0,
      output: 20.0,
      cache_creation_input_tokens: 5.0,
      cache_read_input_tokens: 0.4,
      long_context: {
        prompt_token_threshold: 272_001,
        input: 8.0,
        output: 30.0,
        cache_creation_input_tokens: 10.0,
        cache_read_input_tokens: 0.8,
      },
    });
    expect(
      OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream.tokenPricing
    ).toEqual({
      cacheHit: 0.4,
      standardInput: 4.0,
      standardOutput: 20.0,
    });
    expect(
      OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream.tokenPricing
    ).toEqual({
      cacheHit: 0.44,
      standardInput: 4.4,
      standardOutput: 22.0,
    });
  });

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

  it("exposes Terra long context as a separate provider-backed model", () => {
    const endpoint =
      OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream;
    const instance = new endpoint({ OPENAI_API_KEY: "test" });
    const payload = instance.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      endpoint.configSchema.parse({})
    );

    expect(endpoint.contextSize).toBe(1_050_000);
    expect(endpoint.maxOutputTokens).toBe(128_000);
    expect(
      OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream.contextSize
    ).toBe(1_050_000);
    expect(GPT_5_6_TERRA_LONG_CONTEXT_MODEL_CONFIG.contextSize).toBe(1_050_000);
    expect(payload.model).toBe("gpt-5.6-terra");
    expect(payload.max_output_tokens).toBe(128_000);
  });

  it("requests concise reasoning summaries for streaming and batch when enabled", () => {
    const config =
      OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream.configSchema.parse({});
    const conciseConfig = { ...config, conciseReasoningSummary: true };
    const payload = { conversation: { system: [], messages: [] } };
    const stream = new OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream({
      OPENAI_API_KEY: "test",
    });
    const batch = new OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch({
      OPENAI_API_KEY: "test",
    });

    expect(stream.buildRequestPayload(payload, config).reasoning?.summary).toBe(
      "auto"
    );
    expect(
      stream.buildRequestPayload(payload, conciseConfig).reasoning?.summary
    ).toBe("concise");
    expect(
      batch.buildRequestPayload(payload, conciseConfig).reasoning?.summary
    ).toBe("concise");
  });

  it("gates the Terra long-context endpoint behind its feature flag", () => {
    const workspace = {
      featureFlags: [],
      isEnterprise: true,
      isCreditPriced: true,
    };
    const modelFilter = {
      model: { eq: GPT_5_6_TERRA_LONG_CONTEXT },
    };

    expect(
      isEndpointAvailable(
        DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream,
        workspace,
        modelFilter
      )
    ).toBe(false);
    expect(
      isEndpointAvailable(
        DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream,
        {
          ...workspace,
          featureFlags: ["gpt_5_6_terra_long_context"],
        },
        modelFilter
      )
    ).toBe(true);
  });
});
