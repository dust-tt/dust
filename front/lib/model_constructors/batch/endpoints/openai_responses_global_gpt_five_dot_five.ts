import { OpenAIResponsesBatch } from "@app/lib/model_constructors/batch/clients/openai_responses";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithOpenAIGptFiveDotFiveConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_five";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotFiveBatch extends WithOpenAIGptFiveDotFiveConfig(
  OpenAIResponsesBatch
) {
  // Batch pricing is half the standard OpenAI rate.
  static readonly tokenPricing = {
    standardInput: 2.5,
    standardOutput: 15.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveDotFiveBatch satisfies BatchEndpointConstructor;
