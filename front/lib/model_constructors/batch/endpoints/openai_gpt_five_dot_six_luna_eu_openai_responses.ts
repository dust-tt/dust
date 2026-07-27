import { OpenAIResponsesBatch } from "@app/lib/model_constructors/batch/clients/openai_responses";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixLunaConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_luna";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch extends WithOpenAIGptFiveDotSixLunaConfig(
  OpenAIResponsesBatch
) {
  // Batch pricing is half the standard OpenAI rate, itself charged a 10%
  // regional uplift for models released on or after March 5, 2026.
  // https://developers.openai.com/api/docs/models/gpt-5.6-luna
  static readonly tokenPricing = {
    standardInput: 0.55,
    standardOutput: 3.3,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch satisfies BatchEndpointConstructor;
