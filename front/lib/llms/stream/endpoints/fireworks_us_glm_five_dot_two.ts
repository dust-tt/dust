import { WithDustFireworksGlm52Config } from "@app/lib/llms/providers/fireworks/models/glm_five_dot_two";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksUsGlmFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_us_glm_five_dot_two";

export class DustFireworksUsGlmFiveDotTwoStream extends WithDustFireworksGlm52Config(
  FireworksUsGlmFiveDotTwoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksUsGlmFiveDotTwoStream);
