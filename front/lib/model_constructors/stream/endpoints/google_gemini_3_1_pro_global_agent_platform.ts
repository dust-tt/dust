import { WithGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_pro";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGeminiThreeDotOneProGlobalAgentPlatformStream extends WithGoogleAiStudioGeminiThreeDotOneProConfig(
  GoogleAgentPlatformStream
) {
  // Global endpoint bills at base rate (non-global adds 10%).
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.4,
    standardInput: 4.0,
    standardOutput: 18.0,
  };

  static readonly region = GLOBAL;
  static readonly regionalEndpoint = "global";

  static readonly id = this.buildId();
}

GoogleAiStudioGeminiThreeDotOneProGlobalAgentPlatformStream satisfies StreamEndpointConstructor;
