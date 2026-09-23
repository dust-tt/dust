import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixLunaConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_luna";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixLunaEuropeOpenAIResponsesStream extends WithOpenAIGptSixLunaConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-09-22: https://developers.openai.com/api/docs/pricing
  // Regional (data residency) endpoints are charged a 10% uplift for models
  // released on or after March 5, 2026.
  static readonly tokenPricing = {
    cacheHit: 0.011,
    standardInput: 0.11,
    standardOutput: 0.55,
  };

  // Verified 2026-09-22: https://developers.openai.com/api/docs/models/gpt-6-luna
  // EU data residency is available on Standard processing only, so no Flex.
  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptSixLunaEuropeOpenAIResponsesStream satisfies StreamEndpointConstructor;
