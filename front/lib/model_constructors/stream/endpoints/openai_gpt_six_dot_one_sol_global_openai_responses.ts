import { OPENAI_GLOBAL_BASE_URL } from "@app/lib/model_constructors/providers/openai/base_url";
import { WithOpenAIGptSixDotOneSolConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_six_dot_one_sol";
import { OpenAIResponsesStream } from "@app/lib/model_constructors/stream/clients/openai_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class OpenAIGptSixDotOneSolGlobalOpenAIResponsesStream extends WithOpenAIGptSixDotOneSolConfig(
  OpenAIResponsesStream
) {
  // Verified 2026-09-30: https://developers.openai.com/api/docs/models/gpt-6.1-sol
  static readonly tokenPricing = {
    cacheHit: 0.1,
    standardInput: 2.0,
    standardOutput: 10.0,
  };

  // Verified 2026-09-30: https://developers.openai.com/api/docs/models/gpt-6.1-sol
  static readonly supportsFlexProcessing = true;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();

  protected readonly baseUrl = OPENAI_GLOBAL_BASE_URL;
}

OpenAIGptSixDotOneSolGlobalOpenAIResponsesStream satisfies StreamEndpointConstructor;
