import { WithMoonshotAiKimiK3Config } from "@app/lib/model_constructors/providers/fireworks/models/kimi_k3";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { MOONSHOT_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class MoonshotAiKimiK3GlobalFireworksStream extends WithMoonshotAiKimiK3Config(
  FireworksStream
) {
  // https://fireworks.ai/models/fireworks/kimi-k3
  static readonly tokenPricing = {
    cacheHit: 0.3,
    standardInput: 3.0,
    standardOutput: 15.0,
  };
  static readonly lab = MOONSHOT_AI_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
MoonshotAiKimiK3GlobalFireworksStream satisfies StreamEndpointConstructor;
