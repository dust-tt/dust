import { GoogleAiStudioBatch } from "@app/lib/model_constructors/batch/clients/google_ai_studio";
import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { WithGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_pro";
import { US } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioUsGeminiThreeDotOneProBatch extends WithGoogleAiStudioGeminiThreeDotOneProConfig(
  GoogleAiStudioBatch
) {
  // Batch pricing is half the standard Gemini rate.
  static readonly tokenPricing = {
    standardInput: 2.0,
    standardOutput: 9.0,
  };

  static readonly region = US;

  static readonly id = this.buildId();
}

GoogleAiStudioUsGeminiThreeDotOneProBatch satisfies BatchEndpointConstructor;
