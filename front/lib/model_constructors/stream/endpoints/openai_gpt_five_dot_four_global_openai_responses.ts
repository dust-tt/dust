import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotFourConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotFourGlobalOpenAIResponsesStream extends WithOpenAIGptFiveDotFourConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4
  static readonly tokenPricing = {
    cacheHit: 0.25,
    standardInput: 2.5,
    standardOutput: 15.0,
  };

  // Verified 2026-08-21: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptFiveDotFourGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
