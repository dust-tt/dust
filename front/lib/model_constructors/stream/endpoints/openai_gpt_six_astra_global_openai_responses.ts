import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixAstraConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_astra";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixAstraGlobalOpenAIResponsesStream extends WithOpenAIGptSixAstraConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-09-05: https://developers.openai.com/api/docs/pricing
  static readonly tokenPricing = {
    cacheHit: 1.0,
    standardInput: 10.0,
    standardOutput: 50.0,
  };

  // Verified 2026-09-05: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptSixAstraGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
