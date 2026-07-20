import { WithDustZAiGlm52Config } from "@app/lib/llms/providers/fireworks/models/glm_five_dot_two";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { ZAiGlmFiveDotTwoGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_two_global_fireworks";

export class DustZAiGlmFiveDotTwoGlobalFireworksStream extends WithDustZAiGlm52Config(
  ZAiGlmFiveDotTwoGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustZAiGlmFiveDotTwoGlobalFireworksStream);
