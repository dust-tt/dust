import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixLunaConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_luna";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotSixLunaStream extends WithOpenAIGptFiveDotSixLunaConfig(
  OpenAIResponsesStream,
) {
  // https://developers.openai.com/api/docs/models/gpt-5.6-luna
  static readonly tokenPricing = {
    cacheHit: 0.1,
    standardInput: 1.0,
    standardOutput: 6.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIResponsesGlobalGptFiveDotSixLunaStream satisfies StreamEndpointConstructor;
