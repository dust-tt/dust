// @vitest-environment node

import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing";
import { DustXaiGrokFourDotFiveGlobalXaiStream } from "@app/lib/llms/stream/endpoints/xai_grok_four_dot_five_global_xai";
import { DustXaiGrokFourDotSixGlobalXaiStream } from "@app/lib/llms/stream/endpoints/xai_grok_four_dot_six_global_xai";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import { XaiGrokFourDotSixGlobalXaiStream } from "@app/lib/model_constructors/stream/endpoints/xai_grok_four_dot_six_global_xai";
import { GROK_4_5, GROK_4_6 } from "@app/lib/model_constructors/types/models";
import {
  GROK_4_6_MODEL_CONFIG,
  GROK_4_6_MODEL_ID,
} from "@app/types/assistant/models/xai";
import { describe, expect, it } from "vitest";

const NATIVE_CONTEXT_SIZE = 500_000;
const EXPECTED_CONTEXT_SIZE = 256_000;
const EXPECTED_MAX_OUTPUT_TOKENS = 64_000;
const EXPECTED_MAX_INPUT_TOKENS = 192_000;

describe("Grok 4.6 model configuration", () => {
  it("keeps the native spec on the model_constructors endpoint", () => {
    expect(XaiGrokFourDotSixGlobalXaiStream.contextSize).toBe(
      NATIVE_CONTEXT_SIZE
    );
    expect(XaiGrokFourDotSixGlobalXaiStream.maxOutputTokens).toBe(
      NATIVE_CONTEXT_SIZE
    );
  });

  it("caps context and output in the Dust layer", () => {
    expect(DustXaiGrokFourDotSixGlobalXaiStream.contextSize).toBe(
      EXPECTED_CONTEXT_SIZE
    );
    expect(DustXaiGrokFourDotSixGlobalXaiStream.maxOutputTokens).toBe(
      EXPECTED_MAX_OUTPUT_TOKENS
    );
    expect(GROK_4_6_MODEL_CONFIG.contextSize).toBe(EXPECTED_CONTEXT_SIZE);
    expect(GROK_4_6_MODEL_CONFIG.generationTokensCount).toBe(
      EXPECTED_MAX_OUTPUT_TOKENS
    );
    expect(
      GROK_4_6_MODEL_CONFIG.contextSize -
        GROK_4_6_MODEL_CONFIG.generationTokensCount
    ).toBe(EXPECTED_MAX_INPUT_TOKENS);
  });

  it.each([
    [DustXaiGrokFourDotFiveGlobalXaiStream, GROK_4_5],
    [DustXaiGrokFourDotSixGlobalXaiStream, GROK_4_6],
  ])("makes %s available without feature flags", (endpoint, model) => {
    expect(
      isEndpointAvailable(
        endpoint,
        {
          featureFlags: [],
          isCreditPriced: false,
          isEnterprise: false,
        },
        { model: { eq: model } }
      )
    ).toBe(true);
  });

  it("uses documented reasoning efforts with high as the default", () => {
    const endpoint = XaiGrokFourDotSixGlobalXaiStream;

    expect(endpoint.configSchema.parse({}).reasoning).toEqual({
      effort: "high",
    });
    expect(
      endpoint.configSchema.parse({ reasoning: { effort: "xhigh" } }).reasoning
    ).toEqual({ effort: "xhigh" });
    expect(
      endpoint.configSchema.safeParse({ reasoning: { effort: "minimal" } })
        .success
    ).toBe(false);
    expect(GROK_4_6_MODEL_CONFIG.defaultReasoningEffort).toBe("high");
  });

  it("forwards the stable prompt cache key to xAI Responses", () => {
    const endpoint = new XaiGrokFourDotSixGlobalXaiStream({
      XAI_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      XaiGrokFourDotSixGlobalXaiStream.configSchema.parse({
        cacheKey: "workspace:agent",
      })
    );

    expect(payload.prompt_cache_key).toBe("workspace:agent");
  });

  it("retains automatic reasoning summaries", () => {
    const endpoint = new XaiGrokFourDotSixGlobalXaiStream({
      XAI_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      XaiGrokFourDotSixGlobalXaiStream.configSchema.parse({})
    );

    expect(payload.reasoning?.summary).toBe("auto");
  });

  it("keeps short and long-context pricing in sync", () => {
    expect(XaiGrokFourDotSixGlobalXaiStream.tokenPricing).toEqual({
      cacheHit: 0.5,
      standardInput: 2,
      standardOutput: 6,
    });
    expect(MODEL_PRICING[GROK_4_6_MODEL_ID]).toEqual({
      input: 2,
      output: 6,
      cache_read_input_tokens: 0.5,
      long_context: {
        prompt_token_threshold: 200_000,
        input: 4,
        output: 12,
        cache_read_input_tokens: 1,
      },
    });
  });
});
