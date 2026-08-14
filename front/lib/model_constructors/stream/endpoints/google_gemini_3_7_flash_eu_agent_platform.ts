import { WithGoogleGeminiThreeDotSevenFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_7_flash";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

// Not registered in STREAM_ENDPOINTS: this model is not available on the EU
// agent-platform endpoint. Kept defined for when EU support lands.
export class GoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream extends WithGoogleGeminiThreeDotSevenFlashConfig(
  GoogleAgentPlatformStream
) {
  // Agent platform bills 10% more in multi-region.
  // https://ai.google.dev/gemini-api/docs/pricing (2026-08-14): base $1.50/M
  // input, $7.50/M output, $0.15/M cached input; +10% for the EU endpoint.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.165,
    standardInput: 1.65,
    standardOutput: 8.25,
  };

  static readonly region = EUROPE;
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

GoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream satisfies StreamEndpointConstructor;
