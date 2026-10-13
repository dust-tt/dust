import { WithGoogleGeminiFourArgonConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_4_argon";
import { GoogleAgentPlatformStream } from "@app/lib/model_constructors/stream/clients/google_agent_platform";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class GoogleGeminiFourArgonGlobalAgentPlatformStream extends WithGoogleGeminiFourArgonConfig(
  GoogleAgentPlatformStream
) {
  // https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
  // (2026-10-13): The global endpoint costs $2/M input, $10/M output, and
  // $0.10/M cached input through 2026-11-30. Pricing changes to $4/M input,
  // $20/M output, and $0.20/M cached input on 2026-12-01.
  static readonly tokenPricing = {
    // Gemini uses implicit caching; cache creation is not charged.
    cacheCreated: 0,
    cacheHit: 0.1,
    standardInput: 2,
    standardOutput: 10,
  };

  static readonly region = GLOBAL;
  static readonly regionalEndpoint = "global";

  static readonly id = this.buildId();
}

GoogleGeminiFourArgonGlobalAgentPlatformStream satisfies StreamEndpointConstructor;
