import { WithGoogleAiStudioGemini31ProConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_pro";
import { GoogleAiStudioStream } from "@app/lib/model_constructors/stream/clients/google_ai_studio";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleAiStudioGlobalGemini31ProStream extends WithGoogleAiStudioGemini31ProConfig(
  GoogleAiStudioStream
) {
  // https://ai.google.dev/gemini-api/docs/pricing (verify before launch).
  static readonly tokenPricing = {
    cacheCreated: 0,
    cacheHit: 0.2,
    standardInput: 2.0,
    standardOutput: 12.0,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

GoogleAiStudioGlobalGemini31ProStream satisfies StreamEndpointConstructor;
