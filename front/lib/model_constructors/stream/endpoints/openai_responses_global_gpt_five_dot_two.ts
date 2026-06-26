import { WithOpenAIGptFiveDotTwoConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_two";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotTwoStream extends WithOpenAIGptFiveDotTwoConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.2
  static readonly tokenPricing = {
    cacheHit: 0.175,
    standardInput: 1.75,
    standardOutput: 14.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveDotTwoStream satisfies StreamEndpointConstructor;
