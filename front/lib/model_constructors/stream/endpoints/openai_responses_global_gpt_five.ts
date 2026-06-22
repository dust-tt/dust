import { WithOpenAIGptFiveConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveStream extends WithOpenAIGptFiveConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5
  static readonly tokenPricing = {
    cacheHit: 0.125,
    standardInput: 1.25,
    standardOutput: 10.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveStream satisfies StreamEndpointConstructor;
