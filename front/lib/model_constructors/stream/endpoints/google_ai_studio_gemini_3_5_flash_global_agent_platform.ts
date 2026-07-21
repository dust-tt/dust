import { WithGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_5_flash";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream extends WithGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAgentPlatformStream
) {
  // Global endpoint bills at base rate (non-global adds 10%).
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.15,
    standardInput: 1.5,
    standardOutput: 9.0,
  };

  static readonly region = GLOBAL;
  static readonly regionalEndpoint = "global";

  static readonly id = this.buildId();
}

GoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream satisfies StreamEndpointConstructor;
