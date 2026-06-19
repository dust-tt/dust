import { WithOpenAIGptFiveNanoConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_nano";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveNanoStream extends WithOpenAIGptFiveNanoConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5-nano
  static readonly tokenPricing = {
    cacheHit: 0.005,
    standardInput: 0.05,
    standardOutput: 0.4,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveNanoStream satisfies StreamEndpointConstructor;
