import { GoogleAiStudioBatch } from "@app/lib/model_constructors/batch/clients/google_ai_studio";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithGoogleGeminiThreeDotFiveFlashLiteConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_5_flash_lite";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch extends WithGoogleGeminiThreeDotFiveFlashLiteConfig(
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

GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch satisfies BatchEndpointConstructor;
