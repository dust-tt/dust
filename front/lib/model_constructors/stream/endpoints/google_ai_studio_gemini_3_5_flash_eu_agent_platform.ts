import { WithGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_5_flash";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGeminiThreeDotFiveFlashEuropeAgentPlatformStream extends WithGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAgentPlatformStream
) {
  // Agent platform bills 10% more in multi-region.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.165,
    standardInput: 1.65,
    standardOutput: 9.9,
  };

  static readonly region = EUROPE;
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

GoogleAiStudioGeminiThreeDotFiveFlashEuropeAgentPlatformStream satisfies StreamEndpointConstructor;
