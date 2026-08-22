import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixTerraLongContextConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_terra_long_context";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream extends WithOpenAIGptFiveDotSixTerraLongContextConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-08-19: https://developers.openai.com/api/docs/models/gpt-5.6-terra
  // Dynamic long-context rates are applied by the billing pricing table.
  static readonly tokenPricing = {
    cacheHit: 0.2,
    standardInput: 2.0,
    standardOutput: 12.0,
  };

  // Verified 2026-08-21: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
