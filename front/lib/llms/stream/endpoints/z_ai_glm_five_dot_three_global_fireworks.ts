import { WithDustZAiGlm53Config } from "@app/lib/llms/providers/fireworks/models/glm_five_dot_three";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { ZAiGlmFiveDotThreeGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_global_fireworks";

export class DustZAiGlmFiveDotThreeGlobalFireworksStream extends WithDustZAiGlm53Config(
  ZAiGlmFiveDotThreeGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustZAiGlmFiveDotThreeGlobalFireworksStream);
