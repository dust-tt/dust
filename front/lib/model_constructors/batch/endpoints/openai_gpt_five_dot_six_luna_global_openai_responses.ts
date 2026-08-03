import { OpenAIResponsesBatch } from "@app/lib/model_constructors/batch/clients/openai_responses";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixLunaConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_luna";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch extends WithOpenAIGptFiveDotSixLunaConfig(
  OpenAIResponsesBatch
) {
  // Batch pricing is half the standard OpenAI rate.
  // https://developers.openai.com/api/docs/models/gpt-5.6-luna
  static readonly tokenPricing = {
    standardInput: 0.1,
    standardOutput: 0.6,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch satisfies BatchEndpointConstructor;
