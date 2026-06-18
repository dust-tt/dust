import { WithOpenAIGptFiveDotFiveConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_five";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotFiveStream extends WithOpenAIGptFiveDotFiveConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.5
  static readonly tokenPricing = {
    cacheHit: 0.5,
    standardInput: 5.0,
    standardOutput: 30.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveDotFiveStream satisfies StreamEndpointConstructor;
