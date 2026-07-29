import { WithMoonshotAiKimiK2Dot5Config } from "@app/lib/model_constructors/providers/fireworks/models/kimi_k2_dot_five";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { MOONSHOT_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class MoonshotAiKimiK2Dot5GlobalFireworksStream extends WithMoonshotAiKimiK2Dot5Config(
  FireworksStream
) {
  // https://fireworks.ai/models/fireworks/kimi-k2p5
  static readonly tokenPricing = {
    cacheHit: 0.1,
    standardInput: 0.6,
    standardOutput: 3.0,
  };
  static readonly lab = MOONSHOT_AI_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
MoonshotAiKimiK2Dot5GlobalFireworksStream satisfies StreamEndpointConstructor;
