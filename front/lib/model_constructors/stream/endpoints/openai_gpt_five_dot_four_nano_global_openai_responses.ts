import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotFourNanoConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four_nano";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream extends WithOpenAIGptFiveDotFourNanoConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4-nano
  static readonly tokenPricing = {
    cacheHit: 0.02,
    standardInput: 0.2,
    standardOutput: 1.25,
  };

  // Verified 2026-08-20: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
