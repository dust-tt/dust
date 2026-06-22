import { WithFireworksGlm52Config } from "@app/lib/model_constructors/providers/fireworks/models/glm_five_dot_two";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class FireworksGlobalGlmFiveDotTwoStream extends WithFireworksGlm52Config(
  FireworksStream
) {
  // https://fireworks.ai/models/fireworks/glm-5p2
  static readonly tokenPricing = {
    cacheHit: 0.26,
    standardInput: 1.4,
    standardOutput: 4.4,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

FireworksGlobalGlmFiveDotTwoStream satisfies StreamEndpointConstructor;
