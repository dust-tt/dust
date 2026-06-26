import { WithGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_5_flash";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream extends WithGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAiStudioStream
) {
  // https://ai.google.dev/gemini-api/docs/pricing (verify before launch).
  static readonly tokenPricing = {
    cacheCreated: 1.0,
    cacheHit: 0.15,
    standardInput: 1.5,
    standardOutput: 9.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream satisfies StreamEndpointConstructor;
