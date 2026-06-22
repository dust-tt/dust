import { GoogleAiStudioBatch } from "@app/lib/model_constructors/batch/clients/google_ai_studio";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch extends WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  GoogleAiStudioBatch
) {
  // Batch pricing is half the standard Gemini rate.
  static readonly tokenPricing = {
    standardInput: 0.125,
    standardOutput: 0.75,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch satisfies BatchEndpointConstructor;
