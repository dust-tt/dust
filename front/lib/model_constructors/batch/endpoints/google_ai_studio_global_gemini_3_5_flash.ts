import { GoogleAiStudioBatch } from "@app/lib/model_constructors/batch/clients/google_ai_studio";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_5_flash";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch extends WithGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAiStudioBatch
) {
  // Batch pricing is half the standard Gemini rate.
  static readonly tokenPricing = {
    standardInput: 0.75,
    standardOutput: 4.5,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch satisfies BatchEndpointConstructor;
