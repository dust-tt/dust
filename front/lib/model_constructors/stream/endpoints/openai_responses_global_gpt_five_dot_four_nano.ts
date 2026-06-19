import { WithOpenAIGptFiveDotFourNanoConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_four_nano";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesGlobalGptFiveDotFourNanoStream extends WithOpenAIGptFiveDotFourNanoConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5.4-nano
  static readonly tokenPricing = {
    cacheHit: 0.02,
    standardInput: 0.2,
    standardOutput: 1.25,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIResponsesGlobalGptFiveDotFourNanoStream satisfies StreamEndpointConstructor;
