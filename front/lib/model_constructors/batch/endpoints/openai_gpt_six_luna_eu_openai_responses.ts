import { OpenAIResponsesBatch } from "@app/lib/model_constructors/batch/clients/openai_responses";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixLunaConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_luna";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixLunaEuropeOpenAIResponsesBatch extends WithOpenAIGptSixLunaConfig(
  OpenAIResponsesBatch
) {
  // Batch pricing is half the standard OpenAI rate, itself charged a 10%
  // regional uplift for models released on or after March 5, 2026.
  // Verified 2026-09-22: https://developers.openai.com/api/docs/pricing
  static readonly tokenPricing = {
    standardInput: 0.055,
    standardOutput: 0.275,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptSixLunaEuropeOpenAIResponsesBatch satisfies BatchEndpointConstructor;
