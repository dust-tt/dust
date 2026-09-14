import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptFiveDotSixSolConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_sol";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream extends WithOpenAIGptFiveDotSixSolConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-08-26: https://developers.openai.com/api/docs/pricing
  // Promotional pricing is available at least through 2026-11-21; re-verify after that date.
  static readonly tokenPricing = {
    cacheHit: 0.4,
    standardInput: 4.0,
    standardOutput: 20.0,
  };

  // Verified 2026-08-20: https://developers.openai.com/api/docs/pricing
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
