import { WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream extends WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  GoogleAiStudioStream
) {
  //TODO(new-llm): implement progressive token billing
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.025,
    standardInput: 0.25,
    standardOutput: 1.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream satisfies StreamEndpointConstructor;
