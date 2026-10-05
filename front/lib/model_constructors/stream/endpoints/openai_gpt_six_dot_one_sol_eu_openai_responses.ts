import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixDotOneSolConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_dot_one_sol";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixDotOneSolEuropeOpenAIResponsesStream extends WithOpenAIGptSixDotOneSolConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-09-30: https://developers.openai.com/api/docs/models/gpt-6.1-sol
  // "Regional processing adds a 10% premium where available."
  static readonly tokenPricing = {
    cacheHit: 0.11,
    standardInput: 2.2,
    standardOutput: 11.0,
  };

  // No Flex on EU, as on gpt-6-sol: the model page does not document Flex
  // with EU data residency.
  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptSixDotOneSolEuropeOpenAIResponsesStream satisfies StreamEndpointConstructor;
