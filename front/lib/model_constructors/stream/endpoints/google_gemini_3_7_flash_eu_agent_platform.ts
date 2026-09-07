import { WithGoogleGeminiThreeDotSevenFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_7_flash";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream extends WithGoogleGeminiThreeDotSevenFlashConfig(
  GoogleAgentPlatformStream
) {
  // Agent platform bills 10% more in multi-region.
  // https://ai.google.dev/gemini-api/docs/pricing (2026-08-14): base $0.75/M input,
  // $3.75/M output, $0.075/M cached input; +10% for the EU endpoint.
  // Promotional pricing through 2026-12-31; reverts to $1.65/M input, $8.25/M
  // output, $0.165/M cached input on 2027-01-01 — update this then.
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

GoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream satisfies StreamEndpointConstructor;
