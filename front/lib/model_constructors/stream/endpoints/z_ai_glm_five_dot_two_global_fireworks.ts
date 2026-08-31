import { WithZAiGlm52Config } from "@app/lib/model_constructors/providers/fireworks/models/glm_five_dot_two";
import { FireworksResponsesStream } from "@app/lib/model_constructors/stream/clients/fireworks_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { Z_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class ZAiGlmFiveDotTwoGlobalFireworksStream extends WithZAiGlm52Config(
  FireworksResponsesStream
) {
  // https://fireworks.ai/models/fireworks/glm-5p2
  static readonly tokenPricing = {
    cacheHit: 0.26,
    standardInput: 1.4,
    standardOutput: 4.4,
  };

  static readonly lab = Z_AI_LAB;

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

ZAiGlmFiveDotTwoGlobalFireworksStream satisfies StreamEndpointConstructor;
