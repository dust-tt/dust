import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixAstraConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_astra";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixAstraEuropeOpenAIResponsesStream extends WithOpenAIGptSixAstraConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-09-05: https://developers.openai.com/api/docs/pricing
  // Regional (data residency) endpoints are charged a 10% uplift for models
  // released on or after March 5, 2026.
  static readonly tokenPricing = {
    cacheHit: 1.1,
    standardInput: 11.0,
    standardOutput: 55.0,
  };

  // Verified 2026-09-05: https://developers.openai.com/api/docs/guides/your-data
  // gpt-6-astra supports EU regional processing on the Responses API.
  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptSixAstraEuropeOpenAIResponsesStream satisfies StreamEndpointConstructor;
