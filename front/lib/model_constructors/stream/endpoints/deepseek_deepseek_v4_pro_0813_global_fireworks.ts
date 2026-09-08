import { WithDeepSeekDeepSeekV4Pro0813Config } from "@app/lib/model_constructors/providers/fireworks/models/deepseek_v4_pro_0813";
import { FireworksResponsesStream } from "@app/lib/model_constructors/stream/clients/fireworks_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { DEEPSEEK_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class DeepSeekDeepSeekV4Pro0813GlobalFireworksStream extends WithDeepSeekDeepSeekV4Pro0813Config(
  FireworksResponsesStream
) {
  // Verified 2026-09-07:
  // https://fireworks.ai/models/deepseek-ai/deepseek-v4-pro-0813
  static readonly tokenPricing = {
    cacheHit: 0.044,
    standardInput: 1.32,
    standardOutput: 3.96,
  };
  static readonly lab = DEEPSEEK_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
DeepSeekDeepSeekV4Pro0813GlobalFireworksStream satisfies StreamEndpointConstructor;
