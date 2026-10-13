import { WithGoogleGeminiFourArgonConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_4_argon";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiFourArgonEuropeAgentPlatformStream extends WithGoogleGeminiFourArgonConfig(
  GoogleAgentPlatformStream
) {
  // https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
  // (2026-10-13): The non-global endpoint costs $2.20/M input, $11/M output,
  // and $0.11/M cached input through 2026-11-30. Pricing changes to $4.40/M
  // input, $22/M output, and $0.22/M cached input on 2026-12-01.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.11,
    standardInput: 2.2,
    standardOutput: 11,
  };

  static readonly region = EUROPE;
  static readonly regionalEndpoint = "eu";

  static readonly id = this.buildId();
}

GoogleGeminiFourArgonEuropeAgentPlatformStream satisfies StreamEndpointConstructor;
