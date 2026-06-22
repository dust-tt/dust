import { WithOpenAIGptFiveDotFourConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotFourStream extends WithOpenAIGptFiveDotFourConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4
  static readonly tokenPricing = {
    cacheHit: 0.25,
    standardInput: 2.5,
    standardOutput: 15.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveDotFourStream satisfies StreamEndpointConstructor;
