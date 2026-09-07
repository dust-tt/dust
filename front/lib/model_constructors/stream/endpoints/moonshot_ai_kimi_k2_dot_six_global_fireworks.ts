import { WithMoonshotAiKimiK2Dot6Config } from "@app/lib/model_constructors/providers/fireworks/models/kimi_k2_dot_six";
import { FireworksResponsesStream } from "@app/lib/model_constructors/stream/clients/fireworks_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { MOONSHOT_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class MoonshotAiKimiK2Dot6GlobalFireworksStream extends WithMoonshotAiKimiK2Dot6Config(
  FireworksResponsesStream
) {
  // https://fireworks.ai/models/fireworks/kimi-k2p6
  static readonly tokenPricing = {
    cacheHit: 0.16,
    standardInput: 0.95,
    standardOutput: 4.0,
  };
  static readonly lab = MOONSHOT_AI_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
MoonshotAiKimiK2Dot6GlobalFireworksStream satisfies StreamEndpointConstructor;
