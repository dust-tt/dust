import { WithGoogleGeminiThreeDotSevenFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_7_flash";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream extends WithGoogleGeminiThreeDotSevenFlashConfig(
  GoogleAiStudioStream
) {
  //TODO(new-llm): implement progressive token billing
  // https://ai.google.dev/gemini-api/docs/pricing (2026-08-14): $1.50/M input,
  // $7.50/M output, $0.15/M cached input.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.15,
    standardInput: 1.5,
    standardOutput: 7.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream satisfies StreamEndpointConstructor;
