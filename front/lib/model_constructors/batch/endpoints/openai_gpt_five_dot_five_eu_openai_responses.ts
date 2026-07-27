import { OpenAIResponsesBatch } from "@app/lib/model_constructors/batch/clients/openai_responses";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotFiveConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_five";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch extends WithOpenAIGptFiveDotFiveConfig(
  OpenAIResponsesBatch
) {
  // Batch pricing is half the standard OpenAI rate, itself charged a 10%
  // regional uplift for models released on or after March 5, 2026.
  static readonly tokenPricing = {
    standardInput: 2.75,
    standardOutput: 16.5,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch satisfies BatchEndpointConstructor;
