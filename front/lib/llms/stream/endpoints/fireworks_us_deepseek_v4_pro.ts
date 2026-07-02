import { WithDustFireworksDeepSeekV4ProConfig } from "@app/lib/llms/providers/fireworks/models/deepseek_v4_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { FireworksUsDeepSeekV4ProStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_us_deepseek_v4_pro";

export class DustFireworksUsDeepSeekV4ProStream extends WithDustFireworksDeepSeekV4ProConfig(
  FireworksUsDeepSeekV4ProStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustFireworksUsDeepSeekV4ProStream);
