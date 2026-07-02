import { WithGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_pro";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { US } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioUsGeminiThreeDotOneProStream extends WithGoogleAiStudioGeminiThreeDotOneProConfig(
  GoogleAiStudioStream
) {
  //TODO(new-llm): implement progressive token billing
  static readonly tokenPricing = {
    cacheCreated: 4.5,
    cacheHit: 0.4,
    standardInput: 4.0,
    standardOutput: 18.0,
  };

  static readonly region = US;

  static readonly id = this.buildId();
}

GoogleAiStudioUsGeminiThreeDotOneProStream satisfies StreamEndpointConstructor;
