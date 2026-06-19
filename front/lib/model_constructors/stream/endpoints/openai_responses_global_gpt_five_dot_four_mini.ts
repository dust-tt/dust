import { WithOpenAIGptFiveDotFourMiniConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four_mini";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotFourMiniStream extends WithOpenAIGptFiveDotFourMiniConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4-mini
  static readonly tokenPricing = {
    cacheHit: 0.075,
    standardInput: 0.75,
    standardOutput: 4.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveDotFourMiniStream satisfies StreamEndpointConstructor;
