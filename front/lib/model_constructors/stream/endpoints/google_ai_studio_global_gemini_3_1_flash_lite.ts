import { WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream extends WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  GoogleAiStudioStream
) {
  // https://ai.google.dev/gemini-api/docs/pricing (verify before launch).
  static readonly tokenPricing = {
    cacheCreated: 1.0,
    cacheHit: 0.025,
    standardInput: 0.25,
    standardOutput: 1.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream satisfies StreamEndpointConstructor;
