import { WithDeepSeekDeepSeekV4ProConfig } from "@app/lib/model_constructors/providers/fireworks/models/deepseek_v4_pro";
import { FireworksStream } from "@app/lib/model_constructors/stream/clients/fireworks";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { DEEPSEEK_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class DeepSeekDeepSeekV4ProGlobalFireworksStream extends WithDeepSeekDeepSeekV4ProConfig(
  FireworksStream
) {
  // Verified 2026-08-19:
  // https://docs.fireworks.ai/serverless/pricing
  static readonly tokenPricing = {
    cacheHit: 0.145,
    standardInput: 1.74,
    standardOutput: 3.48,
  };
  static readonly lab = DEEPSEEK_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
DeepSeekDeepSeekV4ProGlobalFireworksStream satisfies StreamEndpointConstructor;
