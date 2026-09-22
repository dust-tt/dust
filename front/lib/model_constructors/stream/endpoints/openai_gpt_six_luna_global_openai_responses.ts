import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixLunaConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_luna";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixLunaGlobalOpenAIResponsesStream extends WithOpenAIGptSixLunaConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-09-22: https://developers.openai.com/api/docs/pricing
  static readonly tokenPricing = {
    cacheHit: 0.01,
    standardInput: 0.1,
    standardOutput: 0.5,
  };

  // Verified 2026-09-22: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptSixLunaGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
