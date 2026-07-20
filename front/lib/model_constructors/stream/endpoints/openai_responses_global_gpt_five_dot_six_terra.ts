import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixTerraConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_terra";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotSixTerraStream extends WithOpenAIGptFiveDotSixTerraConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.6-terra
  static readonly tokenPricing = {
    cacheHit: 0.25,
    standardInput: 2.5,
    standardOutput: 15.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIResponsesGlobalGptFiveDotSixTerraStream satisfies StreamEndpointConstructor;
