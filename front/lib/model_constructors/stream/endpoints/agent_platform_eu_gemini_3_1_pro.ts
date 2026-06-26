import { WithGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_pro";
import { AgentPlatformGoogleStream } from "@app/lib/model_constructors/stream/clients/agent_platform_google";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class AgentPlatformEuropeGeminiThreeDotOneProStream extends WithGoogleAiStudioGeminiThreeDotOneProConfig(
  AgentPlatformGoogleStream
) {
  // https://cloud.google.com/vertex-ai/generative-ai/pricing (verify before launch).
  static readonly tokenPricing = {
    cacheCreated: 4.5,
    cacheHit: 0.4,
    standardInput: 4.0,
    standardOutput: 18.0,
  };

  static readonly region = EUROPE;
  static readonly regionalEndpoint = "global";

  static readonly id = this.buildId();
}

AgentPlatformEuropeGeminiThreeDotOneProStream satisfies StreamEndpointConstructor;
