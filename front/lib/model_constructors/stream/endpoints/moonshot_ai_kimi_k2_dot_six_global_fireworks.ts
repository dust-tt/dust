import { WithMoonshotAiKimiK2Dot6Config } from "@app/lib/model_constructors/providers/fireworks/models/kimi_k2_dot_six";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class MoonshotAiKimiK2Dot6GlobalFireworksStream extends WithMoonshotAiKimiK2Dot6Config(
  FireworksStream
) {
  // https://fireworks.ai/models/fireworks/kimi-k2p6
  static readonly tokenPricing = {
    cacheHit: 0.16,
    standardInput: 0.95,
    standardOutput: 4.0,
  };
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
MoonshotAiKimiK2Dot6GlobalFireworksStream satisfies StreamEndpointConstructor;
