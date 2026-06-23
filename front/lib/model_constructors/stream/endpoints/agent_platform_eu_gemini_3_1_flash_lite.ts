import { WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/model_constructors/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { AgentPlatformGoogleStream } from "@app/lib/model_constructors/stream/clients/agent_platform_google";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream extends WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  AgentPlatformGoogleStream
) {
  // https://cloud.google.com/vertex-ai/generative-ai/pricing (verify before launch).
  static readonly tokenPricing = {
    cacheCreated: 1.0,
    cacheHit: 0.025,
    standardInput: 0.25,
    standardOutput: 1.5,
  };

  static readonly region = EUROPE;
  static readonly regionalEndpoint = "global";

  static readonly id = this.buildId();
}

AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream satisfies StreamEndpointConstructor;
