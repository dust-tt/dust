import { WithGoogleGeminiThreeDotOneProConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_pro";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream extends WithGoogleGeminiThreeDotOneProConfig(
  GoogleAiStudioStream
) {
  //TODO(new-llm): implement progressive token billing
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.4,
    standardInput: 4.0,
    standardOutput: 18.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream satisfies StreamEndpointConstructor;
