import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveMiniConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_mini";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIResponsesEuropeGptFiveMiniStream extends WithOpenAIGptFiveMiniConfig(
  OpenAIResponsesStream
) {
  // https://developers.openai.com/api/docs/models/gpt-5-mini
  static readonly tokenPricing = {
    cacheHit: 0.025,
    standardInput: 0.25,
    standardOutput: 2.0,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIResponsesEuropeGptFiveMiniStream satisfies StreamEndpointConstructor;
