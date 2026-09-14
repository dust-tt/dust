import { OPENAI_EU_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixTerraLongContextConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_terra_long_context";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream extends WithOpenAIGptFiveDotSixTerraLongContextConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-08-19: https://developers.openai.com/api/docs/models/gpt-5.6-terra
  // Regional endpoints add 10%; dynamic long-context rates are applied by billing.
  static readonly tokenPricing = {
    cacheHit: 0.22,
    standardInput: 2.2,
    standardOutput: 13.2,
  };

  static readonly region = EUROPE;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_EU_BASE_URL;
}

OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream satisfies StreamEndpointConstructor;
