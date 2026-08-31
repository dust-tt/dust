import { WithZAiGlm53FlashConfig } from "@app/lib/model_constructors/providers/fireworks/models/glm_five_dot_three_flash";
import { FireworksResponsesStream } from "@app/lib/model_constructors/stream/clients/fireworks_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { Z_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class ZAiGlmFiveDotThreeFlashGlobalFireworksStream extends WithZAiGlm53FlashConfig(
  FireworksResponsesStream
) {
  // Verified 2026-08-31: https://fireworks.ai/models/fireworks/glm-5p3-flash
  static readonly tokenPricing = {
    cacheHit: 0.029,
    standardInput: 0.15,
    standardOutput: 0.5,
  };

  static readonly lab = Z_AI_LAB;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

ZAiGlmFiveDotThreeFlashGlobalFireworksStream satisfies StreamEndpointConstructor;
