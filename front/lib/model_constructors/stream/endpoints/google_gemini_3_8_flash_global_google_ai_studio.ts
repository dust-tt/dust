import { WithGoogleGeminiThreeDotEightFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_8_flash";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream extends WithGoogleGeminiThreeDotEightFlashConfig(
  GoogleAiStudioStream
) {
  // https://ai.google.dev/gemini-api/docs/pricing (2026-09-04): standard
  // pricing from 2027-01-01, excluding the introductory promotion.
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

GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream satisfies StreamEndpointConstructor;
