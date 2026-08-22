import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveGlobalOpenAIResponsesStream extends WithOpenAIGptFiveConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5
  static readonly tokenPricing = {
    cacheHit: 0.125,
    standardInput: 1.25,
    standardOutput: 10.0,
  };

  // Verified 2026-08-20: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptFiveGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
