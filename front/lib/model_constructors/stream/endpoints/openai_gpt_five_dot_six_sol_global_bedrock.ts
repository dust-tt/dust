import { WithOpenAIGptFiveDotSixSolConfig } from "@app/lib/model_constructors/providers/openai/models/gpt_five_dot_six_sol";
import { OpenAIResponsesBedrockStream } from "@app/lib/model_constructors/stream/clients/openai_responses_bedrock";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

// GPT-5.6 Sol on Bedrock, model id `global.openai.gpt-5.6-sol` (the global
// cross-Region inference profile).
// https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html
// (verified 2026-09-10)
export class OpenAIGptFiveDotSixSolGlobalBedrockStream extends WithOpenAIGptFiveDotSixSolConfig(
  OpenAIResponsesBedrockStream
) {
  // Global CRIS rates for the short (272k) context window, which is the window
  // the shared Sol config exposes. The 1M window is billed at twice that
  // ($8/$30) and would need its own endpoint, as it does on OpenAI direct.
  // Bedrock also bills cache writes at $5.00/1M (30m TTL), which the Responses
  // API does not report separately, so `tokenPricing` cannot model it — cost
  // accounting under-reports the first request of each cached prefix.
  // https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html
  // (verified 2026-09-10)
  static readonly tokenPricing = {
    cacheHit: 0.4,
    standardInput: 4.0,
    standardOutput: 20.0,
  };

  // Bedrock serves this model on the Standard tier only: Priority, Flex and
  // Reserved are unsupported, so `supportsFlexProcessing` stays unset.

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

OpenAIGptFiveDotSixSolGlobalBedrockStream satisfies StreamEndpointConstructor;
