import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotFourNanoConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four_nano";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesEuropeGptFiveDotFourNanoStream extends WithOpenAIGptFiveDotFourNanoConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4-nano
  // Regional (data residency) endpoints are charged a 10% uplift for models
  // released on or after March 5, 2026.
  static readonly tokenPricing = {
    cacheHit: 0.022,
    standardInput: 0.22,
    standardOutput: 1.375,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIResponsesEuropeGptFiveDotFourNanoStream satisfies StreamEndpointConstructor;
