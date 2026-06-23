import { WithGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_5_flash";
import { AgentPlatformGoogleStream } from "@app/lib/model_constructors/stream/clients/agent_platform_google";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class AgentPlatformEuropeGeminiThreeDotFiveFlashStream extends WithGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  AgentPlatformGoogleStream
) {
  // https://cloud.google.com/vertex-ai/generative-ai/pricing (verify before launch).
  static readonly tokenPricing = {
    cacheCreated: 1.0,
    cacheHit: 0.15,
    standardInput: 1.5,
    standardOutput: 9.0,
  };

  static readonly region = EUROPE;
  static readonly regionalEndpoint = "global";

  static readonly id = this.buildId();
}

AgentPlatformEuropeGeminiThreeDotFiveFlashStream satisfies StreamEndpointConstructor;
