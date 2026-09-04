import { WithGoogleGeminiThreeDotEightFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_8_flash";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream extends WithGoogleGeminiThreeDotEightFlashConfig(
  GoogleAiStudioStream
) {
  // https://ai.google.dev/gemini-api/docs/pricing (2026-09-04): $0.75/M input,
  // $3.75/M output, and $0.075/M cached input through 2026-12-31. Pricing
  // changes to $1.50/M input, $7.50/M output, and $0.15/M cached input on
  // 2027-01-01.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.075,
    standardInput: 0.75,
    standardOutput: 3.75,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream satisfies StreamEndpointConstructor;
