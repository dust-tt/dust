import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixSolConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_sol";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream extends WithOpenAIGptFiveDotSixSolConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-08-26: https://developers.openai.com/api/docs/pricing
  // Regional (data residency) endpoints are charged a 10% uplift for models
  // released on or after March 5, 2026.
  static readonly tokenPricing = {
    cacheHit: 0.44,
    standardInput: 4.4,
    standardOutput: 22.0,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream satisfies StreamEndpointConstructor;
