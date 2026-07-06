import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotFourMiniConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four_mini";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesEuropeGptFiveDotFourMiniStream extends WithOpenAIGptFiveDotFourMiniConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4-mini
  // Regional (data residency) endpoints are charged a 10% uplift for models
  // released on or after March 5, 2026.
  static readonly tokenPricing = {
    cacheHit: 0.0825,
    standardInput: 0.825,
    standardOutput: 4.95,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIResponsesEuropeGptFiveDotFourMiniStream satisfies StreamEndpointConstructor;
