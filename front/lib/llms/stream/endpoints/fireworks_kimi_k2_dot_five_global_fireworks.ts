import { WithDustFireworksKimiK2Dot5Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksKimiK2Dot5GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_kimi_k2_dot_five_global_fireworks";

export class DustFireworksKimiK2Dot5GlobalFireworksStream extends WithDustFireworksKimiK2Dot5Config(
  FireworksKimiK2Dot5GlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksKimiK2Dot5GlobalFireworksStream);
