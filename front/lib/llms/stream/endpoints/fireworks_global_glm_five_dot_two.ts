import { WithDustFireworksGlm52Config } from "@app/lib/llms/providers/fireworks/models/glm_five_dot_two";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksGlmFiveDotTwoGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_glm_five_dot_two_global_fireworks";

export class DustFireworksGlobalGlmFiveDotTwoStream extends WithDustFireworksGlm52Config(
  FireworksGlmFiveDotTwoGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksGlobalGlmFiveDotTwoStream);
