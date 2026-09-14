import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotFourMiniConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four_mini";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream extends WithOpenAIGptFiveDotFourMiniConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4-mini
  static readonly tokenPricing = {
    cacheHit: 0.075,
    standardInput: 0.75,
    standardOutput: 4.5,
  };

  // Verified 2026-08-20: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
