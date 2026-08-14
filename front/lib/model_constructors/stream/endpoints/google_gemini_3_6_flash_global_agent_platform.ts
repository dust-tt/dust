import { WithGoogleGeminiThreeDotSixFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_6_flash";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream extends WithGoogleGeminiThreeDotSixFlashConfig(
  GoogleAgentPlatformStream
) {
  // Global endpoint bills at base rate (non-global adds 10%).
  // https://ai.google.dev/gemini-api/docs/pricing (2026-07-25): $0.75/M input,
  // $3.75/M output, $0.075/M cached input.
  // Promotional pricing through 2026-12-31; reverts to $1.50/M input, $7.50/M
  // output, $0.15/M cached input on 2027-01-01 — update this then.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.075,
    standardInput: 0.75,
    standardOutput: 3.75,
  };

  static readonly region = GLOBAL;
  static readonly regionalEndpoint = "global";

  static readonly id = this.buildId();
}

GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream satisfies StreamEndpointConstructor;
