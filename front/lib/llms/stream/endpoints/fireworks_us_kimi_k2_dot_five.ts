import { WithDustFireworksKimiK2Dot5Config } from "@app/lib/llms/providers/fireworks/models/kimi_k2_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksUsKimiK2Dot5Stream } from "@app/lib/model_constructors/stream/endpoints/fireworks_us_kimi_k2_dot_five";

export class DustFireworksUsKimiK2Dot5Stream extends WithDustFireworksKimiK2Dot5Config(
  FireworksUsKimiK2Dot5Stream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksUsKimiK2Dot5Stream);
