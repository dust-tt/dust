import { WithGoogleGeminiThreeDotEightFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_8_flash";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

// Not registered in STREAM_ENDPOINTS: `@google/genai` maps the `eu` location to
// `eu-aiplatform.googleapis.com`, which returned "Invalid hostname" in a live
// test on 2026-09-04. Kept defined for when the native API supports EU.
export class GoogleGeminiThreeDotEightFlashEuropeAgentPlatformStream extends WithGoogleGeminiThreeDotEightFlashConfig(
  GoogleAgentPlatformStream
) {
  // https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
  // (2026-09-04): The non-global endpoint costs $0.825/M input, $4.125/M
  // output, and $0.0825/M cached input through 2026-12-31. Pricing changes to
  // $1.65/M input, $8.25/M output, and $0.165/M cached input on 2027-01-01.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.0825,
    standardInput: 0.825,
    standardOutput: 4.125,
  };

  static readonly region = EUROPE;
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

GoogleGeminiThreeDotEightFlashEuropeAgentPlatformStream satisfies StreamEndpointConstructor;
