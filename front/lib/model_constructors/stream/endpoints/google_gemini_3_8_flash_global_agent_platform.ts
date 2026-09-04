import { WithGoogleGeminiThreeDotEightFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_8_flash";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream extends WithGoogleGeminiThreeDotEightFlashConfig(
  GoogleAgentPlatformStream
) {
  // https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
  // (2026-09-04): The global endpoint costs $0.75/M input, $3.75/M output,
  // and $0.075/M cached input through 2026-12-31. Pricing changes to
  // $1.50/M input, $7.50/M output, and $0.15/M cached input on 2027-01-01.
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

GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream satisfies StreamEndpointConstructor;
