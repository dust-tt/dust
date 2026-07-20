import { WithDeepSeekDeepSeekV4ProConfig } from "@app/lib/model_constructors/providers/fireworks/models/deepseek_v4_pro";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class DeepSeekDeepSeekV4ProGlobalFireworksStream extends WithDeepSeekDeepSeekV4ProConfig(
  FireworksStream
) {
  // https://fireworks.ai/models/fireworks/deepseek-v4-pro
  static readonly tokenPricing = {
    cacheHit: 0.14,
    standardInput: 1.74,
    standardOutput: 3.48,
  };
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
DeepSeekDeepSeekV4ProGlobalFireworksStream satisfies StreamEndpointConstructor;
