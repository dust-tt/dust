import { WithZAiGlm53MistralConfig } from "@app/lib/model_constructors/providers/mistral/models/glm_five_dot_three";
import { MistralStream } from "@app/lib/model_constructors/stream/clients/mistral";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { Z_AI_LAB } from "@app/lib/model_constructors/types/labs";
import { EUROPE } from "@app/lib/model_constructors/types/regions";

export class ZAiGlmFiveDotThreeEuropeMistralStream extends WithZAiGlm53MistralConfig(
  MistralStream
) {
  // 1.1x list price ($1.4 / $4.4 / $0.14 cached):
  // https://docs.mistral.ai/models/zai-glm-5-3 and
  // https://docs.mistral.ai/inference/regional-inference (2026-09-28).
  static readonly tokenPricing = {
    standardInput: 1.54,
    standardOutput: 4.84,
    cacheHit: 0.154,
  };

  static readonly lab = Z_AI_LAB;

  // Inference runs in the EU; the endpoint remains usable from both US and EU.
  static readonly region = EUROPE;

  static readonly id = this.buildId();

  modelToHostModel = (): string => "zai-glm-5-3";
}

ZAiGlmFiveDotThreeEuropeMistralStream satisfies StreamEndpointConstructor;
