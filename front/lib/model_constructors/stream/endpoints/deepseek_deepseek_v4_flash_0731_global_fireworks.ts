import { WithDeepSeekDeepSeekV4Flash0731Config } from "@app/lib/model_constructors/providers/fireworks/models/deepseek_v4_flash_0731";
import { FireworksResponsesStream } from "@app/lib/model_constructors/stream/clients/fireworks_responses";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { DEEPSEEK_LAB } from "@app/lib/model_constructors/types/labs";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class DeepSeekDeepSeekV4Flash0731GlobalFireworksStream extends WithDeepSeekDeepSeekV4Flash0731Config(
  FireworksResponsesStream
) {
  // https://fireworks.ai/models/deepseek-ai/deepseek-v4-flash-0731
  static readonly tokenPricing = {
    cacheHit: 0.028,
    standardInput: 0.14,
    standardOutput: 0.28,
  };
  static readonly lab = DEEPSEEK_LAB;
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
DeepSeekDeepSeekV4Flash0731GlobalFireworksStream satisfies StreamEndpointConstructor;
