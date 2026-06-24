import { WithDustFireworksGlm52Config } from "@app/lib/llms/providers/fireworks/models/glm_five_dot_two";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksGlobalGlmFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_glm_five_dot_two";

export class DustFireworksGlobalGlmFiveDotTwoStream extends WithDustFireworksGlm52Config(
  FireworksGlobalGlmFiveDotTwoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksGlobalGlmFiveDotTwoStream);
