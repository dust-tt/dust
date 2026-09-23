import { OpenAIResponsesBatch } from "@app/lib/model_constructors/batch/clients/openai_responses";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixLunaConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_luna";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixLunaGlobalOpenAIResponsesBatch extends WithOpenAIGptSixLunaConfig(
  OpenAIResponsesBatch
) {
  // Batch pricing is half the standard OpenAI rate.
  // Verified 2026-09-22: https://developers.openai.com/api/docs/pricing
  static readonly tokenPricing = {
    standardInput: 0.05,
    standardOutput: 0.25,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptSixLunaGlobalOpenAIResponsesBatch satisfies BatchEndpointConstructor;
