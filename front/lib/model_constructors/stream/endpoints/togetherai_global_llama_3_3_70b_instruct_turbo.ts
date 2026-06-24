import { WithTogetheraiLlama3370BInstructTurboConfig } from "@app/lib/model_constructors/providers/togetherai/models/llama_3_3_70b_instruct_turbo";
import { TogetheraiStream } from "@app/lib/model_constructors/stream/clients/togetherai";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";

export class TogetheraiGlobalLlama3370BInstructTurboStream extends WithTogetheraiLlama3370BInstructTurboConfig(
  TogetheraiStream
) {
  // https://www.together.ai/models/llama-3-3-70b ($1.04 / 1M tokens, in & out)
  static readonly tokenPricing = {
    standardInput: 1.04,
    standardOutput: 1.04,
  };

  static readonly region = GLOBAL;

  static readonly id = this.buildId();
}

TogetheraiGlobalLlama3370BInstructTurboStream satisfies StreamEndpointConstructor;
